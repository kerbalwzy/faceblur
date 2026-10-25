import { describe, expect, it, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSessionStore, type Stage } from '@/stores/session'
import { usePrefsStore } from '@/stores/prefs'
import type { LoadedImage } from '@/pipeline/import-image'
import type { VideoInfo } from '@/pipeline/import-video'

function fakeImage(): LoadedImage {
  return {
    bitmap: { width: 100, height: 100, close: () => {} } as unknown as ImageBitmap,
    width: 100,
    height: 100,
    pixels: 10_000,
    name: 'a.jpg',
    type: 'image/jpeg',
  }
}

function fakeVideo(): VideoInfo {
  return {
    duration: 10,
    width: 640,
    height: 480,
    estimatedFrames: 300,
    url: 'blob:fake',
    element: { pause: () => {}, removeAttribute: () => {}, load: () => {} } as unknown as HTMLVideoElement,
    name: 'a.mp4',
    type: 'video/mp4',
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('会话状态机', () => {
  it('初始为 idle，且没有素材', () => {
    const s = useSessionStore()
    expect(s.stage).toBe('idle')
    expect(s.hasMedia).toBe(false)
    expect(s.canExport).toBe(false)
  })

  it('设置图片后进入 detecting', () => {
    const s = useSessionStore()
    s.setImage(fakeImage())
    expect(s.stage).toBe('detecting')
    expect(s.hasImage).toBe(true)
    expect(s.busy).toBe(true)
  })

  it('检测结果到达后进入 ready，可导出', () => {
    const s = useSessionStore()
    s.setImage(fakeImage())
    s.setFaces([])
    s.stage = 'ready'
    expect(s.canExport).toBe(true)
    expect(s.busy).toBe(false)
  })

  it('视频导入后直接 ready（处理是另一条流程）', () => {
    const s = useSessionStore()
    s.setVideo(fakeVideo())
    expect(s.kind).toBe('video')
    expect(s.stage).toBe('ready')
  })

  it('状态迁移：loading / detecting / processing 都属于 busy', () => {
    const s = useSessionStore()
    for (const st of ['loading', 'detecting', 'processing'] as Stage[]) {
      s.stage = st
      expect(s.busy).toBe(true)
    }
    for (const st of ['idle', 'ready', 'done', 'error'] as Stage[]) {
      s.stage = st
      expect(s.busy).toBe(false)
    }
  })

  it('出错时记录可读信息并进入 error', () => {
    const s = useSessionStore()
    s.fail(new Error('模型下载失败'))
    expect(s.stage).toBe('error')
    expect(s.error?.message).toBe('模型下载失败')
    expect(s.error?.retryable).toBe(true)
  })

  it('不可重试的错误会标记 retryable=false', () => {
    const s = useSessionStore()
    s.fail(new Error('格式不支持'), false)
    expect(s.error?.retryable).toBe(false)
  })

  it('逐脸开关与批量操作', () => {
    const s = useSessionStore()
    s.setFaces([
      { x: 0, y: 0, width: 10, height: 10, score: 0.9, kps: [] },
      { x: 20, y: 0, width: 10, height: 10, score: 0.8, kps: [] },
    ])
    expect(s.faceCount).toBe(2)
    expect(s.enabledCount).toBe(2)

    s.toggleFace(0)
    expect(s.enabledCount).toBe(1)

    s.setAllFaces(false)
    expect(s.enabledCount).toBe(0)

    s.setAllFaces(true)
    expect(s.enabledCount).toBe(2)
  })

  it('reset 清空所有素材与结果', () => {
    const s = useSessionStore()
    s.setImage(fakeImage())
    s.setFaces([])
    s.resultBlob = new Blob(['x'])
    s.reset()

    expect(s.stage).toBe('idle')
    expect(s.hasMedia).toBe(false)
    expect(s.resultBlob).toBeNull()
    expect(s.faces).toHaveLength(0)
  })

  it('替换素材时清除上一素材的检测结果', () => {
    const s = useSessionStore()
    s.setImage(fakeImage())
    s.setFaces([{ x: 0, y: 0, width: 10, height: 10, score: 0.9, kps: [] }])
    expect(s.faceCount).toBe(1)

    s.setImage(fakeImage())
    expect(s.faceCount).toBe(0)
  })
})

describe('偏好持久化（仅非敏感项）', () => {
  it('默认值符合设计（模糊、圆角、0.6 强度）', () => {
    const p = usePrefsStore()
    expect(p.prefs.style).toBe('blur')
    expect(p.prefs.shape).toBe('rounded')
    expect(p.prefs.strength).toBe(0.6)
  })

  it('修改后写入 localStorage', async () => {
    const p = usePrefsStore()
    p.prefs.style = 'pixelate'
    await new Promise((r) => setTimeout(r, 0))
    const saved = JSON.parse(localStorage.getItem('faceblur:prefs') ?? '{}')
    expect(saved.style).toBe('pixelate')
  })

  it('非法值被清洗，不会破坏 UI', async () => {
    localStorage.setItem(
      'faceblur:prefs',
      JSON.stringify({ style: 'evil', shape: 123, strength: 99, format: 'text/html' }),
    )
    const p = usePrefsStore()
    expect(p.prefs.style).toBe('blur') // 回退默认
    expect(p.prefs.shape).toBe('rounded')
    expect(p.prefs.strength).toBe(0.6)
    expect(p.prefs.format).toBe('image/jpeg')
  })

  it('损坏的 JSON 不会抛错', () => {
    localStorage.setItem('faceblur:prefs', '{not json')
    const p = usePrefsStore()
    expect(p.prefs.style).toBe('blur')
  })

  it('素材与检测结果绝不进入持久化存储', () => {
    const s = useSessionStore()
    s.setImage(fakeImage())
    s.setFaces([{ x: 1, y: 2, width: 3, height: 4, score: 0.9, kps: [] }])

    // 遍历所有 localStorage 值，确认没有素材数据
    const dump = Object.keys(localStorage)
      .map((k) => localStorage.getItem(k) ?? '')
      .join('|')
    expect(dump).not.toContain('a.jpg')
    expect(dump).not.toContain('blob:')
    // 也不应出现坐标数组
    expect(dump).not.toMatch(/\[1,2,3,4\]/)
  })
})

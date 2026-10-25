import { describe, expect, it } from 'vitest'
import {
  canUseWebCodecs,
  renderVideoFrame,
  VIDEO_DET_SIZE,
  VideoCancelled,
  throwIfAborted,
} from '@/pipeline/video-pipeline'
import { CanvasRecorder, extForMime, pickRecorderMime } from '@/pipeline/video/encode-mediarecorder'
import { estimateBitrate } from '@/pipeline/video/encode-webcodecs'
import type { FaceBox } from '@/engine/detector'

const face = (x: number, y: number): FaceBox => ({
  x,
  y,
  width: 60,
  height: 80,
  score: 0.9,
  kps: Array.from({ length: 5 }, (_, i) => [x + 30, y + 40 + i] as [number, number]),
})

function fakeCtx() {
  const ops: string[] = []
  return {
    ops,
    save: () => ops.push('save'),
    restore: () => ops.push('restore'),
    clearRect: () => ops.push('clearRect'),
    drawImage: () => ops.push('drawImage'),
    beginPath: () => ops.push('beginPath'),
    clip: () => ops.push('clip'),
    ellipse: () => ops.push('ellipse'),
    arcTo: () => ops.push('arcTo'),
    moveTo: () => ops.push('moveTo'),
    lineTo: () => ops.push('lineTo'),
    fillRect: () => ops.push('fillRect'),
    globalAlpha: 1,
    fillStyle: '',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  }
}

const settings = { style: 'blur' as const, strength: 0.6, shape: 'rounded' as const }

describe('视频帧渲染', () => {
  it('先绘制原始帧', () => {
    const ctx = fakeCtx()
    renderVideoFrame(ctx as never, {} as never, [], settings, 640, 480)
    expect(ctx.ops).toContain('drawImage')
  })

  it('无人脸时不产生裁剪操作（避免无谓开销）', () => {
    const ctx = fakeCtx()
    renderVideoFrame(ctx as never, {} as never, [], settings, 640, 480)
    expect(ctx.ops).not.toContain('clip')
  })

  it('有人脸时按人数产生遮挡裁剪', () => {
    const ctx = fakeCtx()
    renderVideoFrame(ctx as never, {} as never, [face(10, 10), face(200, 10)], settings, 640, 480)
    expect(ctx.ops.filter((o) => o === 'clip')).toHaveLength(2)
  })

  it('视频检测尺寸固定 320（design D15）', () => {
    expect(VIDEO_DET_SIZE).toBe(320)
  })
})

describe('取消机制', () => {
  it('未取消时不抛错', () => {
    expect(() => throwIfAborted()).not.toThrow()
    expect(() => throwIfAborted(new AbortController().signal)).not.toThrow()
  })

  it('已取消时抛出 VideoCancelled', () => {
    const c = new AbortController()
    c.abort()
    expect(() => throwIfAborted(c.signal)).toThrow(VideoCancelled)
  })
})

describe('编码能力', () => {
  it('能正确报告是否支持 WebCodecs（不抛错）', () => {
    expect(typeof canUseWebCodecs()).toBe('boolean')
  })

  it('码率估算随分辨率增长且被限制在合理范围', () => {
    const sd = estimateBitrate(640, 480, 30)
    const hd = estimateBitrate(1920, 1080, 30)
    expect(hd).toBeGreaterThan(sd)
    expect(estimateBitrate(100, 100, 1)).toBeGreaterThanOrEqual(1_000_000)
    expect(estimateBitrate(7680, 4320, 60)).toBeLessThanOrEqual(20_000_000)
  })
})

describe('MediaRecorder 降级', () => {
  it('MIME 推断扩展名正确', () => {
    expect(extForMime('video/mp4')).toBe('mp4')
    expect(extForMime('video/webm;codecs=vp9')).toBe('webm')
  })

  it('pickRecorderMime 返回字符串（不支持时为空串）', () => {
    expect(typeof pickRecorderMime()).toBe('string')
  })

  it('未开始时 stop 会被拒绝而不是挂起', async () => {
    const recorder = new CanvasRecorder({
      canvas: { captureStream: () => ({}) } as unknown as HTMLCanvasElement,
      fps: 30,
    })
    await expect(recorder.stop()).rejects.toThrow(/尚未开始/)
  })
})

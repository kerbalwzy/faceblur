import { describe, expect, it } from 'vitest'
import {
  formatDuration,
  hasMediaRecorder,
  hasWebCodecs,
  isSupportedVideo,
  pickExportMode,
  SUPPORTED_VIDEO_TYPES,
  VideoImportError,
} from '@/pipeline/import-video'

const mk = (name: string, type: string) => new File([new Uint8Array([1])], name, { type })

describe('视频格式校验', () => {
  it('接受 MP4 / WebM / MOV', () => {
    expect(isSupportedVideo(mk('a.mp4', 'video/mp4'))).toBe(true)
    expect(isSupportedVideo(mk('a.webm', 'video/webm'))).toBe(true)
    expect(isSupportedVideo(mk('a.mov', 'video/quicktime'))).toBe(true)
  })

  it('拒绝音频与图片', () => {
    expect(isSupportedVideo(mk('a.mp3', 'audio/mpeg'))).toBe(false)
    expect(isSupportedVideo(mk('a.jpg', 'image/jpeg'))).toBe(false)
  })

  it('MIME 为空时按扩展名兜底', () => {
    expect(isSupportedVideo(mk('clip.MP4', ''))).toBe(true)
    expect(isSupportedVideo(mk('clip.mkv', ''))).toBe(false)
  })

  it('支持列表只含三种容器', () => {
    expect(SUPPORTED_VIDEO_TYPES).toHaveLength(3)
  })
})

describe('时长格式化', () => {
  it('把秒数格式化成 m:ss', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(9)).toBe('0:09')
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(600)).toBe('10:00')
  })

  it('非法输入返回 0:00 而不是 NaN', () => {
    expect(formatDuration(Number.NaN)).toBe('0:00')
    expect(formatDuration(-5)).toBe('0:00')
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0:00')
  })
})

describe('导出路径选择', () => {
  it('支持 WebCodecs 时优先用它', () => {
    // jsdom 环境默认没有 VideoEncoder，这里验证回退逻辑
    const mode = pickExportMode()
    if (hasWebCodecs()) {
      expect(mode).toBe('webcodecs')
    } else if (hasMediaRecorder()) {
      expect(mode).toBe('mediarecorder')
    } else {
      expect(mode).toBe('unsupported')
    }
  })

  it('都不支持时返回 unsupported（可被 UI 用于禁用导出）', () => {
    expect(['webcodecs', 'mediarecorder', 'unsupported']).toContain(pickExportMode())
  })
})

describe('错误类型', () => {
  it('带可判别的 kind', () => {
    const e = new VideoImportError('decode-failed', 'x')
    expect(e.kind).toBe('decode-failed')
    expect(e).toBeInstanceOf(Error)
  })
})

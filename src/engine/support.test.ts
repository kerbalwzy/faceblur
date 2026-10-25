import { describe, expect, it, vi, afterEach } from 'vitest'
import { assessSupport, isIosNonSafari, RECOMMENDED_BROWSERS } from '@/engine/support'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('环境能力评估', () => {
  it('支持 SIMD 且开启隔离时为 ok', () => {
    vi.stubGlobal('crossOriginIsolated', true)
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 })
    vi.spyOn(WebAssembly, 'validate').mockReturnValue(true)
    const r = assessSupport()
    vi.restoreAllMocks()
    expect(r.level).toBe('ok')
    expect(r.reasons).toEqual([])
    expect(r.simd).toBe(true)
  })

  it('缺少跨源隔离时降级为单线程，但功能可用', () => {
    vi.stubGlobal('crossOriginIsolated', false)
    vi.spyOn(WebAssembly, 'validate').mockReturnValue(true)
    const r = assessSupport()
    vi.restoreAllMocks()
    expect(r.level).toBe('degraded')
    expect(r.reasons).toContain('single-thread')
    expect(r.crossOriginIsolated).toBe(false)
  })

  it('不支持 SIMD 时判定为 unsupported', () => {
    vi.spyOn(WebAssembly, 'validate').mockReturnValue(false)
    vi.stubGlobal('crossOriginIsolated', true)
    const r = assessSupport()
    vi.restoreAllMocks()
    expect(r.level).toBe('unsupported')
    expect(r.reasons).toContain('no-simd')
  })

  it('完全没有 WebAssembly 时优先报告该原因', () => {
    vi.stubGlobal('WebAssembly', undefined)
    const r = assessSupport()
    vi.restoreAllMocks()
    expect(r.level).toBe('unsupported')
    expect(r.reasons).toEqual(['no-webassembly'])
  })

  it('iOS 上的第三方浏览器会额外提示改用 Safari', () => {
    expect(isIosNonSafari('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/120.0')).toBe(true)
    expect(isIosNonSafari('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/17.0 Safari/604.1')).toBe(false)
    expect(isIosNonSafari('Mozilla/5.0 (Windows NT 10.0) Chrome/120')).toBe(false)
  })

  it('推荐浏览器文案包含三家主流浏览器', () => {
    expect(RECOMMENDED_BROWSERS).toContain('Chrome')
    expect(RECOMMENDED_BROWSERS).toContain('Firefox')
    expect(RECOMMENDED_BROWSERS).toContain('Safari')
  })
})

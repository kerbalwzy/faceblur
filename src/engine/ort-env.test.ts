import { describe, expect, it, vi, beforeEach } from 'vitest'

// jsdom 环境下无法真正加载 WASM，这里只验证配置逻辑
vi.mock('onnxruntime-web', () => ({
  env: {
    wasm: { numThreads: 1 },
    logLevel: 'info',
  },
}))

const { configureOrt, __resetOrtCache } = await import('@/engine/ort-env')
const ort = await import('onnxruntime-web')

describe('ort-env', () => {
  beforeEach(() => {
    __resetOrtCache()
  })

  it('未开启跨源隔离时强制单线程', () => {
    const info = configureOrt()
    expect(info.crossOriginIsolated).toBe(false)
    expect(info.numThreads).toBe(1)
    expect(ort.env.wasm.numThreads).toBe(1)
  })

  it('开启隔离且存在 SharedArrayBuffer 时启用多线程（上限 4）', () => {
    vi.stubGlobal('crossOriginIsolated', true)
    vi.stubGlobal('SharedArrayBuffer', class {})
    vi.stubGlobal('navigator', { hardwareConcurrency: 16 })
    const info = configureOrt()
    expect(info.crossOriginIsolated).toBe(true)
    expect(info.numThreads).toBe(4)
    expect(ort.env.wasm.numThreads).toBe(4)
    vi.unstubAllGlobals()
  })

  it('上报的 simd 字段是布尔值，供 UI 判断降级', () => {
    const info = configureOrt()
    expect(typeof info.simd).toBe('boolean')
  })

  it('把日志级别收敛到 warning，避免刷屏', () => {
    configureOrt()
    expect(ort.env.logLevel).toBe('warning')
  })
})

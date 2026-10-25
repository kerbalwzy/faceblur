import { describe, expect, it } from 'vitest'
import { SIMD_TEST_BYTES } from '@/engine/wasm-support'

describe('WASM SIMD 探测', () => {
  it('探测模块是合法的 WASM 模块（否则会把支持 SIMD 的浏览器误判为不支持）', () => {
    // 这条断言是回归保护：曾因函数体多了一个 0x0b 导致 validate 恒为 false
    expect(WebAssembly.validate(SIMD_TEST_BYTES)).toBe(true)
  })

  it('模块体确实使用了 v128 SIMD 指令（0xfd 0x0c = v128.const）', () => {
    const bytes = Array.from(SIMD_TEST_BYTES)
    const idx = bytes.indexOf(0xfd)
    expect(idx).toBeGreaterThan(0)
    expect(bytes[idx + 1]).toBe(0x0c)
  })

  it('损坏的字节序列会被判定为不合法，说明探测不是恒真', () => {
    const broken = SIMD_TEST_BYTES.slice(0, -2)
    expect(WebAssembly.validate(broken)).toBe(false)
  })
})

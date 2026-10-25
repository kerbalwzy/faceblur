/**
 * WASM 能力探测（不依赖 ORT，可在任何环境安全导入）。
 */

/**
 * 最小 WASM 模块，模块体内使用 v128.const（SIMD 指令）。
 *
 * 该字节序列必须**逐字节精确**：V8 要求 v128.const 后跟完整 16 字节立即数，
 * 少一个字节就会 validate 失败，从而把支持 SIMD 的浏览器误判为不支持
 * （上游 facex 的 simd_check.js 就踩过这个坑）。
 * 总长 43 字节，code section 长度 0x16 = 22，函数体长度 0x14 = 20。
 */
export const SIMD_TEST_BYTES = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // magic + version
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, // type: () -> v128
  0x03, 0x02, 0x01, 0x00, // function section
  0x0a, 0x16, 0x01, 0x14, 0x00, // code section: 1 body, len 20, 0 locals
  0xfd, 0x0c, // v128.const
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // 16 字节立即数
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x0b, // end
])

/** 检测当前环境是否支持 WASM SIMD（Chrome 91+ / Firefox 89+ / Safari 16.4+）。 */
export function checkWasmSimd(): boolean {
  try {
    return WebAssembly.validate(SIMD_TEST_BYTES)
  } catch {
    return false
  }
}

export function isCrossOriginIsolated(): boolean {
  return (globalThis as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated === true
}

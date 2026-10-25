/**
 * onnxruntime-web 运行时配置。
 *
 * 必须在创建任何 InferenceSession 之前调用（design D5）。
 * 该模块被 Worker 导入，因此不依赖 DOM。
 */
import * as ort from 'onnxruntime-web'
import { checkWasmSimd, isCrossOriginIsolated } from './wasm-support'

export interface OrtRuntimeInfo {
  /** 实际使用的线程数（1 表示单线程） */
  numThreads: number
  /** 是否跨源隔离（多线程推理的前提） */
  crossOriginIsolated: boolean
  /** 是否支持 WASM SIMD */
  simd: boolean
}

export { checkWasmSimd }

let configured = false
let binaryPromise: Promise<Uint8Array> | null = null

/**
 * 配置 ORT 运行时，返回可上报给 UI 的能力信息。
 * 幂等：重复调用不会重复配置。
 */
export function configureOrt(): OrtRuntimeInfo {
  const simd = checkWasmSimd()
  const isolated = isCrossOriginIsolated()
  // 多线程需要 crossOriginIsolated + SharedArrayBuffer，否则 ORT 会自行退回单线程。
  const hw = (globalThis as unknown as { navigator?: { hardwareConcurrency?: number } }).navigator
    ?.hardwareConcurrency
  const numThreads =
    isolated && typeof SharedArrayBuffer !== 'undefined'
      ? Math.min(4, Math.max(1, hw ?? 1))
      : 1

  if (!configured) {
    ort.env.wasm.numThreads = numThreads
    ort.env.logLevel = 'warning'
    configured = true
  }

  return { numThreads, crossOriginIsolated: isolated, simd }
}

/**
 * 预置 WASM 后端所需的两个文件，并显式告知 ORT 它们的位置。
 *
 * 背景（踩坑记录）：
 *   ORT 在初始化时会 `import()` 胶水模块 `ort-wasm-simd-threaded.mjs`，
 *   并按 `wasmPaths` 前缀解析文件名。若只给 `.wasm` 的 URL 目录，
 *   生产构建下该目录（/assets/）并不包含 `.mjs`，于是报
 *   "Failed to fetch dynamically imported module" —— 而且是在 dev 下正常的，
 *   只有构建产物才会暴露。
 *
 * 因此这里必须**同时**提供 .mjs 与 .wasm 两个确切 URL：
 *   - 通过 Vite 的 `?url` 拿到带 hash 的真实路径（dev/preview/生产都正确）；
 *   - 用对象形式的 wasmPaths 精确映射两个文件名；
 *   - 同时把二进制读进内存，进一步避免 ORT 自己猜路径。
 */
export async function preloadWasmBinary(): Promise<number> {
  configureOrt()

  const glue = await import('./ort-glue')
  binaryPromise ??= fetch(glue.wasmUrl).then(async (res) => {
    if (!res.ok) throw new Error(`加载推理运行时失败：HTTP ${res.status}`)
    return new Uint8Array(await res.arrayBuffer())
  })

  const binary = await binaryPromise

  // 对象形式：分别给出胶水（mjs）与二进制（wasm）的真实 URL。
  // ORT 的 WasmFilePaths 只有这两个字段，不是按文件名映射。
  ort.env.wasm.wasmPaths = {
    mjs: glue.glueUrl,
    wasm: glue.wasmUrl,
  }
  ;(ort.env.wasm as unknown as Record<string, unknown>).wasmBinary = binary

  return binary.byteLength
}

/** 仅供测试与调试：清空已缓存的状态。 */
export function __resetOrtCache(): void {
  configured = false
  binaryPromise = null
}

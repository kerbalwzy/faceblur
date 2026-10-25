// 用相对路径直接 import 真实文件并加 ?url。
// 这是 Vite 支持的标准写法：dev 下返回可访问的 URL，生产下产出带 hash 的资源文件。
// （之前用 resolve.alias 把 '?url' 拼进别名，dev 模式下会返回内联字符串而非 URL。）
import glueUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url'
import wasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url'

/**
 * ORT WASM 胶水与二进制的真实 URL。
 *
 * 为什么用 `?url` 而不是直接 import 模块：
 *   ORT 在初始化时会按文件名去 wasmPaths 里 `import()` 胶水模块，
 *   若把胶水作为源码模块打进 bundle，生产构建下 ORT 仍会按路径查找 → 404。
 *   给出 URL 才能与 ORT 的加载方式对齐。
 */
export { glueUrl, wasmUrl }

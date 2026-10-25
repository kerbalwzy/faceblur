import { fileURLToPath, URL } from 'node:url'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// onnxruntime-web 的 exports 未导出 dist 子路径，需按包目录拼出绝对路径。
// ort.wasm.min.mjs 是「仅 WASM 后端」的入口（约 50 KB），只加载 ort-wasm-simd-threaded.*；
// 默认入口 ort.min.mjs 会去找 27 MB 的 jsep（WebGPU）变体，与本项目只跑 CPU 的定位不符。
const ortRoot = join(dirname(createRequire(import.meta.url).resolve('onnxruntime-web')), '..')
const ortDist = join(ortRoot, 'dist', 'ort.wasm.min.mjs')

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // 使用「外部 WASM」构建：JS 胶水（约 360 KB）打进 bundle，
      // 13.6 MB 的 .wasm 由 public/ort/ 提供并走 ORT 的 wasmPaths 配置（见 src/engine/ort-env.ts）。
      // 默认的 ort.bundle.min.mjs 会内联 wasm，导致无法自托管与长缓存。
      'onnxruntime-web': ortDist,
      // ORT 的 WASM 胶水与二进制（package exports 未导出，用别名指向真实文件）
    },
  },
  server: {
    port: 5173,
    // COOP/COEP：本地开发默认开启，便于验证 onnxruntime-web 多线程推理。
    // 部署到静态托管时同理（见 design D5 / tasks 1.4）。
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  // 让 preview 也能为模型文件给出正确 MIME（与线上托管配置保持一致）
  // 注意：.wasm 由 Vite 内置识别为 application/wasm，无需重复声明。
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1200,
  },
  // Worker 内部有动态 import（onnxruntime-web），必须用 ES 模块格式才能做代码分割；
  // 默认的 iife 不支持 code-splitting，构建会直接失败。
  worker: {
    format: 'es',
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
})

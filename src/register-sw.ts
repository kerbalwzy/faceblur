/**
 * 注册 Service Worker，启用离线能力。
 *
 * 只在生产构建中注册：开发时注册会干扰 Vite 的 HMR，且没意义。
 */
export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  if (!import.meta.env.PROD) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 注册失败只影响离线能力，不影响正常使用
    })
  })
}

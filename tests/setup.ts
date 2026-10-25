import 'fake-indexeddb/auto'

// 单测通用的浏览器环境补丁：jsdom 缺少部分 Canvas / Worker API。
// 仅在测试中按需打桩，避免影响真实运行时代码。
if (typeof globalThis.ImageBitmap === 'undefined') {
  class ImageBitmapPolyfill {
    readonly width: number
    readonly height: number
    constructor(width = 1, height = 1) {
      this.width = width
      this.height = height
    }
    close(): void {}
  }
  ;(globalThis as unknown as Record<string, unknown>).ImageBitmap = ImageBitmapPolyfill
}

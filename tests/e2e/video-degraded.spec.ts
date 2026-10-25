import { test, expect } from '@playwright/test'

/**
 * MediaRecorder 降级路径验证（任务 4.4）。
 *
 * 通过移除 `VideoEncoder` 模拟「浏览器不支持 WebCodecs」，
 * 断言降级路径能完成导出，并且结果被标记为 degraded。
 */
test.describe('MediaRecorder 降级', () => {
  test('禁用 WebCodecs 后仍能导出视频', async ({ page }) => {
    test.setTimeout(180_000)

    // 在页面脚本执行前删除 VideoEncoder，模拟旧浏览器
    await page.addInitScript(() => {
      // @ts-expect-error 故意移除
      delete window.VideoEncoder
    })

    await page.goto('/')

    const r = await page.evaluate(async () => {
      const mod = await import('/src/pipeline/video-pipeline.ts')
      const detMod = await import('/src/engine/face-detector.ts')
      const videoMod = await import('/src/pipeline/import-video.ts')

      const hasWC = mod.canUseWebCodecs()

      const detector = new detMod.FaceDetector()
      await detector.init()
      const resp = await fetch('/test-fixtures/sample-face.mp4')
      const file = new File([await resp.blob()], 's.mp4', { type: 'video/mp4' })
      const info = await videoMod.importVideo(file)

      // 直接把视频加到 DOM：captureStream 需要元素在文档中（部分浏览器要求）
      document.body.appendChild(info.element)

      let result: { size: number; degraded: boolean; ext: string } | null = null
      let error = ''
      try {
        const out = await mod.processVideoRealtime(
          detector,
          info.element,
          { style: 'pixelate', strength: 0.8, shape: 'rounded' },
        )
        result = { size: out.blob.size, degraded: out.degraded, ext: out.ext }
      } catch (e) {
        error = (e as Error).message
      }

      await detector.dispose()
      videoMod.releaseVideo(info)
      info.element.remove()

      return { hasWC, result, error }
    })

    // 前置条件：WebCodecs 确实被禁用了
    expect(r.hasWC).toBe(false)
    expect(r.error).toBe('')
    expect(r.result).not.toBeNull()
    expect(r.result!.size).toBeGreaterThan(1000)
    // 必须被标记为降级
    expect(r.result!.degraded).toBe(true)
    expect(['mp4', 'webm']).toContain(r.result!.ext)
  })
})

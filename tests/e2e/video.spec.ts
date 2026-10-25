import { test, expect } from '@playwright/test'

/**
 * 视频管线的真实端到端验证（任务 4.2 / 4.3 / 4.5 的核心验收）。
 *
 * 用一段 2 秒的 Lena 视频跑完整流程：解码 → 逐帧检测 → 追踪 → 绘制 → WebCodecs 编码，
 * 断言产出可播放的视频文件。
 */
test.describe('视频处理管线', () => {
  test('能处理视频并产出可播放的结果', async ({ page }) => {
    test.setTimeout(180_000)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    await page.goto('/')

    const result = await page.evaluate(async () => {
      const mod = await import('/src/pipeline/video-pipeline.ts')
      const detMod = await import('/src/engine/face-detector.ts')
      const videoMod = await import('/src/pipeline/import-video.ts')

      // 能力检查
      const codec = await mod.selectCodec(512, 512, 30)

      const detector = new detMod.FaceDetector()
      await detector.init()

      // 加载测试视频
      const resp = await fetch('/test-fixtures/sample-face.mp4')
      const blob = await resp.blob()
      const file = new File([blob], 'sample.mp4', { type: 'video/mp4' })
      const info = await videoMod.importVideo(file)

      const progressLog: number[] = []
      const out = await mod.processVideo(
        detector,
        info.element,
        { style: 'blur', strength: 0.8, shape: 'rounded' },
        { onProgress: (p: { ratio: number }) => progressLog.push(p.ratio) },
      )

      const size = out.blob.size
      const head = new Uint8Array(await out.blob.slice(0, 12).arrayBuffer())
      // MP4: 前 4 字节是 box size，接着 'ftyp'
      const isMp4 = String.fromCharCode(...head.slice(4, 8)) === 'ftyp'
      const isWebm = head[0] === 0x1a && head[1] === 0x45

      await detector.dispose()
      videoMod.releaseVideo(info)

      return {
        codec: codec ? { container: codec.container, codec: codec.codec } : null,
        hasWebCodecs: mod.canUseWebCodecs(),
        size,
        mime: out.mime,
        ext: out.ext,
        frames: out.frames,
        degraded: out.degraded,
        isMp4,
        isWebm,
        progressCount: progressLog.length,
        lastProgress: progressLog[progressLog.length - 1] ?? 0,
      }
    })

    expect(errors).toEqual([])
    expect(result.hasWebCodecs).toBe(true)
    expect(result.codec).not.toBeNull()

    // 产出了非空的视频文件
    expect(result.size).toBeGreaterThan(10_000)
    // 容器格式正确
    expect(result.isMp4 || result.isWebm).toBe(true)
    // 走了主路径，不是降级
    expect(result.degraded).toBe(false)
    // 帧数 = 2 秒 × 30fps
    expect(result.frames).toBeGreaterThanOrEqual(55)
    expect(result.frames).toBeLessThanOrEqual(65)

    // 进度持续上报，最终到 1
    expect(result.progressCount).toBeGreaterThan(10)
    expect(result.lastProgress).toBeCloseTo(1, 2)
  })

  test('取消后立即停止并抛 VideoCancelled', async ({ page }) => {
    test.setTimeout(120_000)
    // 重新加载以彻底清除上一个用例遗留的播放中的 video 元素，
    // 否则它会持续解码并让本页的 evaluate 上下文不稳定。
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const r = await page.evaluate(async () => {
      const mod = await import('/src/pipeline/video-pipeline.ts')
      const detMod = await import('/src/engine/face-detector.ts')
      const videoMod = await import('/src/pipeline/import-video.ts')

      const detector = new detMod.FaceDetector()
      await detector.init()

      const resp = await fetch('/test-fixtures/sample-face.mp4')
      const file = new File([await resp.blob()], 's.mp4', { type: 'video/mp4' })
      const info = await videoMod.importVideo(file)

      const ctrl = new AbortController()
      let sawCancel = false
      const started = performance.now()

      try {
        await mod.processVideo(
          detector,
          info.element,
          { style: 'blur', strength: 0.8, shape: 'rounded' },
          {
            signal: ctrl.signal,
            onProgress: (p: { frame: number }) => {
              // 处理到第 5 帧就取消
              if (p.frame >= 5 && !sawCancel) {
                sawCancel = true
                ctrl.abort()
              }
            },
          },
        )
      } catch (e) {
        await detector.dispose()
        videoMod.releaseVideo(info)
        return {
          cancelled: e instanceof mod.VideoCancelled,
          name: (e as Error).name,
          elapsed: performance.now() - started,
        }
      }
      await detector.dispose()
      videoMod.releaseVideo(info)
      return { cancelled: false, name: 'none', elapsed: performance.now() - started }
    })

    expect(r.cancelled).toBe(true)
    expect(r.name).toBe('VideoCancelled')
    // 取消要及时：远小于完整的 2 秒视频处理时间
    expect(r.elapsed).toBeLessThan(20_000)
  })
})

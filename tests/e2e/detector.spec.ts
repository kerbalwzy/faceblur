import { test, expect } from '@playwright/test'

/**
 * 真实模型端到端验证（任务 2.3 / 2.4 的验收条件）。
 *
 * 在真实浏览器里加载 YuNet + onnxruntime-web，对一张已知含单张人脸的照片
 * （Lena，OpenCV 官方样例）执行检测，断言：
 *   - 至少检出 1 张人脸且置信度 > 0.6；
 *   - 框与 5 个关键点**自洽**（关键点必须落在框内）——这条能抓住反变换写错；
 *   - 框中心落在图片中部（防止坐标整体偏移）。
 */

interface Face {
  x: number
  y: number
  width: number
  height: number
  score: number
  kps: Array<[number, number]>
}

interface DetectResult {
  faces: Face[]
  ms: number
  runtime: { simd: boolean; numThreads: number; crossOriginIsolated: boolean } | null
  progress: string[]
  width: number
  height: number
}

async function detectOnce(page: import('@playwright/test').Page, detSize: 320 | 480 | 640) {
  return page.evaluate(async (size) => {
    const mod = await import('/src/engine/face-detector.ts')
    const detector = new mod.FaceDetector()
    const progress: string[] = []
    await detector.init((p: { stage: string; ratio: number }) =>
      progress.push(`${p.stage}:${p.ratio.toFixed(2)}`),
    )

    const img = new Image()
    img.src = '/test-fixtures/sample-face.jpg'
    await img.decode()

    const t0 = performance.now()
    const faces = await detector.detect(await createImageBitmap(img), { detSize: size })
    const ms = performance.now() - t0

    const result = {
      faces,
      ms,
      runtime: detector.runtime,
      progress,
      width: img.naturalWidth,
      height: img.naturalHeight,
    }
    await detector.dispose()
    return result
  }, detSize) as Promise<DetectResult>
}

test.describe('人脸检测引擎', () => {
  test('真实模型能检出 Lena 的人脸，且框与关键点自洽', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    await page.goto('/')
    const result = await detectOnce(page, 320)

    expect(errors).toEqual([])
    expect(result.runtime?.simd).toBe(true)
    expect(result.progress.length).toBeGreaterThan(0)

    expect(result.faces.length).toBeGreaterThanOrEqual(1)

    const face = result.faces[0]
    expect(face.score).toBeGreaterThan(0.6)

    // 框尺寸合理
    expect(face.width).toBeGreaterThan(result.width * 0.1)
    expect(face.width).toBeLessThan(result.width * 0.9)
    expect(face.height).toBeGreaterThan(result.height * 0.1)

    // 框中心落在图片中部（整体偏移会在这里暴露）
    const cx = face.x + face.width / 2
    const cy = face.y + face.height / 2
    expect(cx).toBeGreaterThan(result.width * 0.25)
    expect(cx).toBeLessThan(result.width * 0.75)
    expect(cy).toBeGreaterThan(result.height * 0.2)
    expect(cy).toBeLessThan(result.height * 0.8)

    // 关键点自洽性：5 个点必须都在框内（容差 2px）
    expect(face.kps.length).toBe(5)
    for (const [kx, ky] of face.kps) {
      expect(kx).toBeGreaterThanOrEqual(face.x - 2)
      expect(kx).toBeLessThanOrEqual(face.x + face.width + 2)
      expect(ky).toBeGreaterThanOrEqual(face.y - 2)
      expect(ky).toBeLessThanOrEqual(face.y + face.height + 2)
    }

    // 左右眼应大致等高、且左眼在右眼左侧
    const [rightEye, leftEye] = face.kps
    expect(Math.abs(rightEye[1] - leftEye[1])).toBeLessThan(face.height * 0.2)
    expect(rightEye[0]).toBeLessThan(leftEye[0])

    expect(result.ms).toBeLessThan(500)
  })

  test('三档检测尺寸都能工作，且高分辨率不会明显跑偏', async ({ page }) => {
    await page.goto('/')
    for (const size of [320, 480, 640] as const) {
      const r = await detectOnce(page, size)
      expect(r.faces.length, `detSize=${size} 应至少检出一张脸`).toBeGreaterThanOrEqual(1)
      const f = r.faces[0]
      expect(f.score).toBeGreaterThan(0.6)
      // 三档之间人脸中心不应相差太多
      const cx = f.x + f.width / 2
      expect(Math.abs(cx - r.width / 2)).toBeLessThan(r.width * 0.3)
    }
  })

  test('多次检测结果可复现（同图同参数坐标一致）', async ({ page }) => {
    await page.goto('/')
    const r = await page.evaluate(async () => {
      const mod = await import('/src/engine/face-detector.ts')
      const detector = new mod.FaceDetector()
      await detector.init()
      const img = new Image()
      img.src = '/test-fixtures/sample-face.jpg'
      await img.decode()
      const a = await detector.detect(await createImageBitmap(img), { detSize: 320 })
      const b = await detector.detect(await createImageBitmap(img), { detSize: 320 })
      await detector.dispose()
      return { a, b }
    })

    expect(r.a.length).toBe(r.b.length)
    for (let i = 0; i < r.a.length; i++) {
      expect(Math.abs(r.a[i].x - r.b[i].x)).toBeLessThanOrEqual(1)
      expect(Math.abs(r.a[i].y - r.b[i].y)).toBeLessThanOrEqual(1)
    }
  })

  test('无人脸图片返回空数组且不报错', async ({ page }) => {
    await page.goto('/')
    const faces = await page.evaluate(async () => {
      const mod = await import('/src/engine/face-detector.ts')
      const detector = new mod.FaceDetector()
      await detector.init()

      const c = document.createElement('canvas')
      c.width = 320
      c.height = 320
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#3a7bd5'
      ctx.fillRect(0, 0, 320, 320)

      const out = await detector.detect(await createImageBitmap(c), { detSize: 320 })
      await detector.dispose()
      return out
    })
    expect(faces).toEqual([])
  })

  test('提高阈值可减少结果（阈值生效）', async ({ page }) => {
    await page.goto('/')
    const r = await page.evaluate(async () => {
      const mod = await import('/src/engine/face-detector.ts')
      const detector = new mod.FaceDetector()
      await detector.init()
      const img = new Image()
      img.src = '/test-fixtures/sample-face.jpg'
      await img.decode()
      const low = await detector.detect(await createImageBitmap(img), { detSize: 320, minScore: 0.3 })
      const high = await detector.detect(await createImageBitmap(img), { detSize: 320, minScore: 0.99 })
      await detector.dispose()
      return { low: low.length, high: high.length }
    })
    expect(r.low).toBeGreaterThanOrEqual(r.high)
    expect(r.high).toBe(0)
  })
})

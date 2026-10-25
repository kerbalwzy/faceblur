import { describe, expect, it } from 'vitest'
import type { DetectionOptions, DetectorRuntimeInfo, FaceBox, FaceDetectorClient } from '@/engine/detector'
import { DEFAULT_DET_SIZE, DEFAULT_MIN_SCORE } from '@/engine/detector'

/**
 * 验证检测器契约是可替换的（design D7 / tasks 2.8）。
 *
 * 这里不引入任何具体后端，只用一个 mock 适配器跑通上层会调用的全部方法。
 * 如果将来契约发生变化而 mock 不再能实现它，这个测试就会失败。
 */

/** 一个完全不依赖 ORT 的假检测器，仅用于证明接口自洽。 */
class MockDetector implements FaceDetectorClient {
  runtime: DetectorRuntimeInfo | null = null
  private disposed = false
  readonly calls: Array<{ detSize: number; minScore: number }> = []

  async init(onProgress?: (p: { stage: 'runtime' | 'model' | 'session'; ratio: number }) => void) {
    onProgress?.({ stage: 'runtime', ratio: 0.5 })
    onProgress?.({ stage: 'session', ratio: 1 })
    this.runtime = { simd: true, numThreads: 1, crossOriginIsolated: false }
  }

  async detect(_bitmap: ImageBitmap, opts: DetectionOptions = {}): Promise<FaceBox[]> {
    if (this.disposed) throw new Error('检测器已释放')
    if (!this.runtime) throw new Error('检测器尚未初始化，请先调用 init()')
    const detSize = opts.detSize ?? DEFAULT_DET_SIZE
    const minScore = opts.minScore ?? DEFAULT_MIN_SCORE
    this.calls.push({ detSize, minScore })
    return [
      {
        x: 10,
        y: 20,
        width: 30,
        height: 40,
        score: 0.95,
        kps: Array.from({ length: 5 }, () => [25, 40] as [number, number]),
      },
    ]
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.runtime = null
  }
}

describe('检测器契约可替换性', () => {
  it('mock 适配器可以不依赖 ORT 完成 init/detect/dispose', async () => {
    const d: FaceDetectorClient = new MockDetector()
    const progress: string[] = []
    await d.init((p) => progress.push(p.stage))
    expect(progress).toEqual(['runtime', 'session'])
    expect(d.runtime?.simd).toBe(true)

    const faces = await d.detect({} as ImageBitmap)
    expect(faces).toHaveLength(1)
    expect(faces[0]).toMatchObject({ score: 0.95 })
    expect(faces[0].kps).toHaveLength(5)

    await d.dispose()
    expect(d.runtime).toBeNull()
  })

  it('默认参数由契约提供，适配器无需自定义', async () => {
    const d = new MockDetector()
    await d.init()
    await d.detect({} as ImageBitmap)
    expect(d.calls[0]).toEqual({ detSize: DEFAULT_DET_SIZE, minScore: DEFAULT_MIN_SCORE })
  })

  it('上层逻辑只依赖 FaceBox 字段，不关心后端', async () => {
    // 模拟渲染层的使用方式：只读 x/y/width/height/score/kps
    const d: FaceDetectorClient = new MockDetector()
    await d.init()
    const faces = await d.detect({} as ImageBitmap)
    for (const f of faces) {
      expect(typeof f.x).toBe('number')
      expect(typeof f.y).toBe('number')
      expect(typeof f.width).toBe('number')
      expect(typeof f.height).toBe('number')
      expect(f.score).toBeGreaterThan(0)
      expect(f.kps.every(([kx, ky]) => Number.isFinite(kx) && Number.isFinite(ky))).toBe(true)
    }
  })
})

/**
 * 检测 Worker：加载 ONNX 运行时与 YuNet，串行执行推理。
 *
 * 关于两阶段重检（design D15）：
 *   首轮在整帧上检测后，对「尺寸偏小」的人脸把区域外扩、裁剪、放大再检测一次。
 *   必须在 Worker 内做——bitmap 的所有权已经转移到 Worker，主线程无法再裁剪。
 *
 * 为什么串行：`InferenceSession.run` 不可重入，并行调用会互相干扰。
 */
/// <reference lib="webworker" />
import { configureOrt, preloadWasmBinary } from '../ort-env'
import { loadWeightsCached } from '../io/weight-cache'
import { computeLetterbox, computeUpscale } from '../io/letterbox'
import { buildInputTensor, INPUT_NAME, OUTPUT_NAMES } from '../preprocess'
import { postprocess, type Stride } from '../postprocess/yunet'
import { expandToCrop, mergeRefined, selectSmallFaces, RETRY_DET_SIZE } from '../strategy'
import type { DetSize, FaceBox } from '../detector'
import type { WorkerRequest, WorkerResponse } from './protocol'

declare const self: DedicatedWorkerGlobalScope

type OrtModule = typeof import('onnxruntime-web')
type OrtSession = import('onnxruntime-web').InferenceSession

let ort: OrtModule | null = null
let session: OrtSession | null = null
let ready = false

function post(msg: WorkerResponse): void {
  self.postMessage(msg)
}

type FailStage = 'runtime' | 'model' | 'session' | 'detect'

function fail(message: string, id: number | null = null, stage?: FailStage): void {
  post({ type: 'error', id, message, stage })
}

/**
 * 把源图的某个区域缩放到目标尺寸并取像素。
 * 二次重检时传入裁剪区域，避免每次都对整图重采样。
 */
function readRegion(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  outW: number,
  outH: number,
): { rgba: Uint8ClampedArray; width: number; height: number } {
  const canvas = new OffscreenCanvas(outW, outH)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('无法创建 OffscreenCanvas 2D 上下文')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outW, outH)
  const image = ctx.getImageData(0, 0, outW, outH)
  return { rgba: image.data, width: outW, height: outH }
}

/**
 * 对一张 already-decoded 的图像跑一次检测，返回**源坐标系**的人脸。
 *
 * @param source 画布或 bitmap（尺寸为 width×height）
 * @param width 源宽
 * @param height 源高
 * @param crop 可选：只检测源图中的某块区域（用于二次重检）
 */
async function detectRegion(
  source: CanvasImageSource,
  width: number,
  height: number,
  detSize: DetSize,
  minScore: number,
  crop?: { x: number; y: number; width: number; height: number },
): Promise<FaceBox[]> {
  if (!session || !ort) throw new Error('检测引擎尚未初始化')

  // 只处理关心的区域：裁剪时用子图尺寸，否则用整图
  const regionX = crop?.x ?? 0
  const regionY = crop?.y ?? 0
  const regionW = crop?.width ?? width
  const regionH = crop?.height ?? height

  // 小图先放大，避免小脸在 letterbox 后低于模型可检范围
  const upscale = computeUpscale(regionW, regionH)
  const sampleW = Math.max(1, Math.round(regionW * upscale))
  const sampleH = Math.max(1, Math.round(regionH * upscale))

  const { rgba } = readRegion(source, regionX, regionY, regionW, regionH, sampleW, sampleH)
  const transform = computeLetterbox(sampleW, sampleH, detSize)
  const tensor = buildInputTensor(rgba, transform)

  const input = new ort.Tensor('float32', tensor, [1, 3, detSize, detSize])
  const outputs = await session.run({ [INPUT_NAME]: input })

  const strideList = [8, 16, 32] as const
  const scales = OUTPUT_NAMES.cls.map((_, i) => {
    const stride = strideList[i]
    return {
      stride: stride as Stride,
      cls: outputs[OUTPUT_NAMES.cls[i]].data as Float32Array,
      obj: outputs[OUTPUT_NAMES.obj[i]].data as Float32Array,
      bbox: outputs[OUTPUT_NAMES.bbox[i]].data as Float32Array,
      kps: outputs[OUTPUT_NAMES.kps[i]].data as Float32Array,
      cols: Math.floor(detSize / stride),
      rows: Math.floor(detSize / stride),
    }
  })

  const raw = postprocess(scales, { minScore })

  // 反变换：检测坐标 → 采样图坐标 → 原图坐标。
  // 注意不做裁剪：矩形与关键点必须来自同一变换，越界部分由渲染层处理。
  return raw.map((f) => {
    const [sx, sy] = toSamplePoint(transform, f.rect.x, f.rect.y)
    const sw = f.rect.width / transform.scale
    const sh = f.rect.height / transform.scale
    const kps = f.kps.map(([x, y]) => {
      const [kx, ky] = toSamplePoint(transform, x, y)
      return [kx / upscale, ky / upscale] as [number, number]
    })
    const baseX = crop ? crop.x : 0
    const baseY = crop ? crop.y : 0
    return {
      x: sx / upscale + baseX,
      y: sy / upscale + baseY,
      width: sw / upscale,
      height: sh / upscale,
      score: f.score,
      kps: kps.map(([kx, ky]) => [kx + baseX, ky + baseY] as [number, number]),
    }
  })
}

function toSamplePoint(
  t: ReturnType<typeof computeLetterbox>,
  x: number,
  y: number,
): [number, number] {
  return [(x - t.offsetX) / t.scale, (y - t.offsetY) / t.scale]
}

async function init(req: Extract<WorkerRequest, { type: 'init' }>): Promise<void> {
  post({ type: 'init-progress', stage: 'runtime', ratio: 0.05 })
  const runtime = configureOrt()
  if (!runtime.simd) {
    throw new Error('当前浏览器不支持 WebAssembly SIMD，无法运行人脸检测')
  }
  await preloadWasmBinary()
  post({ type: 'init-progress', stage: 'runtime', ratio: 0.35 })

  post({ type: 'init-progress', stage: 'model', ratio: 0.4 })
  const bytes = await loadWeightsCached(req.modelUrl, {
    key: req.cacheKey,
    // 模型文件不可能小于 100 KB，用于识别损坏的缓存项
    validate: (b) => b.byteLength > 100_000,
    onProgress: ({ loaded, total }) => {
      const ratio = total > 0 ? loaded / total : 0.5
      post({ type: 'init-progress', stage: 'model', ratio: 0.4 + ratio * 0.4 })
    },
  })

  post({ type: 'init-progress', stage: 'session', ratio: 0.85 })
  ort ??= await import('onnxruntime-web')
  session = await ort.InferenceSession.create(bytes as unknown as Uint8Array, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  })

  ready = true
  post({ type: 'init-progress', stage: 'session', ratio: 1 })
  post({
    type: 'ready',
    runtime: {
      simd: runtime.simd,
      numThreads: runtime.numThreads,
      crossOriginIsolated: runtime.crossOriginIsolated,
    },
  })
}

async function detect(req: Extract<WorkerRequest, { type: 'detect' }>): Promise<void> {
  const { id, bitmap, detSize, minScore, refine } = req
  if (!ready || !session || !ort) {
    bitmap.close()
    fail('检测引擎尚未初始化', id, 'detect')
    return
  }

  const started = performance.now()
  try {
    const width = bitmap.width
    const height = bitmap.height

    const faces = await detectRegion(bitmap, width, height, detSize, minScore)

    let final = faces
    if (refine && faces.length > 0) {
      final = await refineSmallFaces(bitmap, width, height, faces, minScore)
    }

    post({ type: 'detect-result', id, faces: final, elapsedMs: performance.now() - started })
  } catch (err) {
    fail((err as Error).message, id, 'detect')
  } finally {
    bitmap.close()
  }
}

/** 对首轮检出的小脸做裁剪放大重检。 */
async function refineSmallFaces(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  faces: FaceBox[],
  minScore: number,
): Promise<FaceBox[]> {
  const small = selectSmallFaces(faces, width, minScore)
  if (small.length === 0) return faces

  // 一次最多重检若干张小脸，避免极端群照把耗时拉爆
  const MAX_REFINE = 8
  const refined: FaceBox[] = []

  for (const face of small.slice(0, MAX_REFINE)) {
    const crop = expandToCrop(face, width, height)
    if (!crop) continue
    try {
      const found = await detectRegion(bitmap, width, height, RETRY_DET_SIZE, minScore, crop)
      refined.push(...found)
    } catch {
      // 单块失败不影响整体
    }
  }

  return refined.length > 0 ? mergeRefined(faces, refined) : faces
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data
  switch (msg.type) {
    case 'init':
      init(msg).catch((err) => fail((err as Error).message, null, 'runtime'))
      break
    case 'detect':
      void detect(msg)
      break
    case 'dispose':
      session?.release?.()
      session = null
      ready = false
      break
  }
}

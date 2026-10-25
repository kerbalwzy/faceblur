import { describe, expect, it, vi } from 'vitest'
import { FaceDetector } from '@/engine/face-detector'
import type { WorkerRequest, WorkerResponse } from '@/engine/worker/protocol'

/** 可编程的假 Worker：记录收到的消息，并能主动回包。 */
class FakeWorker {
  onmessage: ((ev: MessageEvent<WorkerResponse>) => void) | null = null
  onerror: ((ev: ErrorEvent) => void) | null = null
  readonly received: WorkerRequest[] = []
  readonly transfers: Transferable[][] = []
  terminated = false

  postMessage(msg: WorkerRequest, transfer?: Transferable[]): void {
    this.received.push(msg)
    this.transfers.push(transfer ?? [])
  }

  terminate(): void {
    this.terminated = true
  }

  emit(msg: WorkerResponse): void {
    this.onmessage?.({ data: msg } as MessageEvent<WorkerResponse>)
  }
}

function makeBitmap(): ImageBitmap {
  return { width: 100, height: 100, close: vi.fn() } as unknown as ImageBitmap
}

function setup() {
  const worker = new FakeWorker()
  const detector = new FaceDetector({ createWorker: () => worker as unknown as Worker })
  return { worker, detector }
}

async function initReady(worker: FakeWorker, detector: FaceDetector) {
  const p = detector.init()
  // 初始化消息发出后，模拟 Worker 回报 ready
  worker.emit({
    type: 'ready',
    runtime: { simd: true, numThreads: 4, crossOriginIsolated: true },
  })
  await p
}

describe('FaceDetector 客户端', () => {
  it('init 时发送带模型地址与缓存键的消息', async () => {
    const { worker, detector } = setup()
    await initReady(worker, detector)
    const init = worker.received[0]
    expect(init.type).toBe('init')
    expect((init as Extract<WorkerRequest, { type: 'init' }>).modelUrl).toBe('/models/yunet.onnx')
  })

  it('上报初始化进度', async () => {
    const { worker, detector } = setup()
    const stages: string[] = []
    const p = detector.init((prog) => stages.push(prog.stage))
    worker.emit({ type: 'init-progress', stage: 'runtime', ratio: 0.2 })
    worker.emit({ type: 'init-progress', stage: 'model', ratio: 0.6 })
    worker.emit({ type: 'init-progress', stage: 'session', ratio: 0.9 })
    worker.emit({
      type: 'ready',
      runtime: { simd: true, numThreads: 1, crossOriginIsolated: false },
    })
    await p
    expect(stages).toEqual(['runtime', 'model', 'session'])
  })

  it('暴露运行时能力', async () => {
    const { worker, detector } = setup()
    expect(detector.runtime).toBeNull()
    await initReady(worker, detector)
    expect(detector.runtime).toEqual({ simd: true, numThreads: 4, crossOriginIsolated: true })
  })

  it('detect 转移 ImageBitmap 所有权', async () => {
    const { worker, detector } = setup()
    await initReady(worker, detector)

    const bitmap = makeBitmap()
    const result = detector.detect(bitmap)
    const msg = worker.received[1]
    expect(msg.type).toBe('detect')
    expect(worker.transfers[1]).toContain(bitmap)

    worker.emit({ type: 'detect-result', id: (msg as { id: number }).id, faces: [], elapsedMs: 5 })
    await expect(result).resolves.toEqual([])
  })

  it('多个并发请求按 id 正确配对结果', async () => {
    const { worker, detector } = setup()
    await initReady(worker, detector)

    const p1 = detector.detect(makeBitmap())
    const p2 = detector.detect(makeBitmap())

    const id1 = (worker.received[1] as { id: number }).id
    const id2 = (worker.received[2] as { id: number }).id

    const face = { x: 1, y: 2, width: 3, height: 4, score: 0.9, kps: [] as never }
    // 故意乱序回包
    worker.emit({ type: 'detect-result', id: id2, faces: [face], elapsedMs: 3 })
    worker.emit({ type: 'detect-result', id: id1, faces: [], elapsedMs: 3 })

    await expect(p1).resolves.toEqual([])
    await expect(p2).resolves.toEqual([face])
  })

  it('未初始化时 detect 直接报错', async () => {
    const { detector } = setup()
    await expect(detector.detect(makeBitmap())).rejects.toThrow(/尚未初始化/)
  })

  it('初始化失败时 init 被拒绝，并传递可读原因', async () => {
    const { worker, detector } = setup()
    const p = detector.init()
    worker.emit({ type: 'error', id: null, message: '当前浏览器不支持 WebAssembly SIMD' })
    await expect(p).rejects.toThrow(/SIMD/)
  })

  it('推理错误会拒绝对应的请求，不影响其他请求', async () => {
    const { worker, detector } = setup()
    await initReady(worker, detector)

    const p1 = detector.detect(makeBitmap())
    const p2 = detector.detect(makeBitmap())
    const id1 = (worker.received[1] as { id: number }).id
    const id2 = (worker.received[2] as { id: number }).id

    worker.emit({ type: 'error', id: id1, message: '推理失败' })
    worker.emit({ type: 'detect-result', id: id2, faces: [], elapsedMs: 1 })

    await expect(p1).rejects.toThrow('推理失败')
    await expect(p2).resolves.toEqual([])
  })

  it('dispose 终止 Worker 并拒绝未完成请求', async () => {
    const { worker, detector } = setup()
    await initReady(worker, detector)

    const p = detector.detect(makeBitmap())
    await detector.dispose()

    expect(worker.terminated).toBe(true)
    await expect(p).rejects.toThrow(/已释放/)
    await expect(detector.detect(makeBitmap())).rejects.toThrow(/已释放/)
  })

  it('重复调用 init 复用同一个 Promise（不会重复创建 Worker）', async () => {
    let created = 0
    const worker = new FakeWorker()
    const detector = new FaceDetector({
      createWorker: () => {
        created++
        return worker as unknown as Worker
      },
    })
    const a = detector.init()
    const b = detector.init()
    worker.emit({ type: 'ready', runtime: { simd: true, numThreads: 1, crossOriginIsolated: false } })
    await Promise.all([a, b])
    expect(created).toBe(1)
  })
})

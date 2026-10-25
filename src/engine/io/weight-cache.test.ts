import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearWeightCache, loadWeightsCached } from '@/engine/io/weight-cache'

const URL = '/models/yunet.onnx'
const PAYLOAD = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])

function makeFetch(impl?: (call: number) => Uint8Array) {
  let calls = 0
  const fn = vi.fn(async () => {
    calls++
    const body = impl ? impl(calls) : PAYLOAD
    return new Response(body as unknown as BodyInit, {
      status: 200,
      headers: { 'content-length': String(body.byteLength) },
    }) as unknown as Response
  })
  return { fn: fn as unknown as typeof fetch, calls: () => calls }
}

describe('权重缓存', () => {
  beforeEach(async () => {
    await clearWeightCache()
  })

  it('首次下载后写入缓存，二次调用不再发起请求', async () => {
    const f1 = makeFetch()
    const a = await loadWeightsCached(URL, { key: 'test:v1', fetchImpl: f1.fn })
    expect(Array.from(a)).toEqual(Array.from(PAYLOAD))
    expect(f1.calls()).toBe(1)

    const f2 = makeFetch()
    const b = await loadWeightsCached(URL, { key: 'test:v1', fetchImpl: f2.fn })
    expect(Array.from(b)).toEqual(Array.from(PAYLOAD))
    // 命中缓存：不应再发请求
    expect(f2.calls()).toBe(0)
  })

  it('不同 key 互不影响', async () => {
    const f1 = makeFetch()
    await loadWeightsCached(URL, { key: 'k-a', fetchImpl: f1.fn })
    const f2 = makeFetch()
    await loadWeightsCached(URL, { key: 'k-b', fetchImpl: f2.fn })
    expect(f2.calls()).toBe(1)
  })

  it('缓存项损坏时清除并重新下载一次', async () => {
    // 先在缓存里放一份「长度不对」的数据
    const seed = makeFetch(() => new Uint8Array([9, 9, 9]))
    await loadWeightsCached(URL, { key: 'bad:v1', fetchImpl: seed.fn })

    // 这次校验要求 8 字节：发现缓存损坏 → 清除 → 重新下载一次
    const retry = makeFetch(() => PAYLOAD)
    const fixed = await loadWeightsCached(URL, {
      key: 'bad:v1',
      validate: (b) => b.byteLength === 8,
      fetchImpl: retry.fn,
    })
    expect(fixed.byteLength).toBe(8)
    expect(retry.calls()).toBe(1)

    // 修复后的缓存可以正常复用
    const again = makeFetch()
    const reused = await loadWeightsCached(URL, {
      key: 'bad:v1',
      validate: (b) => b.byteLength === 8,
      fetchImpl: again.fn,
    })
    expect(reused.byteLength).toBe(8)
    expect(again.calls()).toBe(0)
  })

  it('合法缓存不触发重复下载', async () => {
    const first = makeFetch()
    await loadWeightsCached(URL, { key: 'ok:v1', validate: (b) => b.byteLength === 8, fetchImpl: first.fn })
    expect(first.calls()).toBe(1)

    const second = makeFetch()
    const bytes = await loadWeightsCached(URL, {
      key: 'ok:v1',
      validate: (b) => b.byteLength === 8,
      fetchImpl: second.fn,
    })
    expect(bytes.byteLength).toBe(8)
    expect(second.calls()).toBe(0)
  })

  it('下载内容校验失败时抛错（不写入缓存）', async () => {
    const f = makeFetch(() => new Uint8Array([1, 2]))
    await expect(
      loadWeightsCached(URL, { key: 'invalid:v1', validate: (b) => b.byteLength === 8, fetchImpl: f.fn }),
    ).rejects.toThrow(/校验失败/)
  })

  it('HTTP 错误时抛出可读错误', async () => {
    const fn = vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch
    await expect(loadWeightsCached(URL, { key: 'err:v1', fetchImpl: fn })).rejects.toThrow(/HTTP 404/)
  })

  it('上报下载进度，最终 loaded 等于 total', async () => {
    const seen: Array<{ loaded: number; total: number }> = []
    const f = makeFetch()
    await loadWeightsCached(URL, {
      key: 'progress:v1',
      fetchImpl: f.fn,
      onProgress: (p) => seen.push(p),
    })
    expect(seen.length).toBeGreaterThan(0)
    const last = seen[seen.length - 1]
    expect(last.loaded).toBe(PAYLOAD.byteLength)
    expect(last.total).toBe(PAYLOAD.byteLength)
  })
})

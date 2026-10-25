/**
 * 模型权重的 IndexedDB 缓存。
 *
 * 需求（specs/face-detection）：
 *   - 权重首下成功后存 IndexedDB，二次访问优先命中，且 MUST NOT 重复发请求；
 *   - 读取项损坏（长度异常 / 无法初始化）时清除并重下一次；
 *   - 缓存不可用（隐私模式、配额不足）时静默降级为纯网络加载，不阻断使用。
 */

const DB_NAME = 'faceblur'
const DB_VERSION = 1
const STORE = 'weights'

export interface CacheProgress {
  loaded: number
  total: number
}

export interface LoadWeightsOptions {
  /** 缓存键，含版本语义，例如 'yunet:v1' */
  key: string
  /** 校验字节数是否合理；返回 false 视为损坏 */
  validate?: (bytes: Uint8Array) => boolean
  onProgress?: (p: CacheProgress) => void
  /** 注入给测试用 */
  fetchImpl?: typeof fetch
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB 不可用'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('打开 IndexedDB 失败'))
    req.onblocked = () => reject(new Error('IndexedDB 被其他标签页阻塞'))
  })
}

/**
 * 把 IndexedDB 读出的值统一转成 Uint8Array。
 *
 * 注意：不能只用 `instanceof ArrayBuffer`。IDE/测试环境的 structured clone
 * 可能返回**来自不同 realm** 的 ArrayBuffer（`instanceof` 为 false 但它是真的缓冲区），
 * 用 Object.prototype.toString 判断才可靠。
 */
function toBytes(value: unknown): Uint8Array | null {
  if (value == null) return null
  const tag = Object.prototype.toString.call(value)
  if (tag === '[object ArrayBuffer]') return new Uint8Array(value as ArrayBuffer)
  if (tag === '[object Uint8Array]') {
    const view = value as Uint8Array
    // 拷贝一份，避免持有跨 realm 视图
    return new Uint8Array(view)
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView
    return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength))
  }
  return null
}

async function readCache(db: IDBDatabase, key: string): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => resolve(toBytes(req.result))
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function writeCache(db: IDBDatabase, key: string, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      // 存一份干净的 ArrayBuffer，避免把大 buffer 的视图整个留下
      tx.objectStore(STORE).put(bytes.slice().buffer, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}

async function deleteCache(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

/** 带进度下载，避免大文件时进度条卡住。 */
async function download(
  url: string,
  onProgress?: (p: CacheProgress) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array> {
  const res = await fetchImpl(url)
  if (!res.ok) throw new Error(`下载模型失败：HTTP ${res.status} ${url}`)

  const total = Number(res.headers.get('content-length') ?? 0)
  // 没有流式能力（或测试桩）时直接整体读取
  if (!res.body?.getReader) {
    const buf = new Uint8Array(await res.arrayBuffer())
    onProgress?.({ loaded: buf.byteLength, total: buf.byteLength })
    return buf
  }

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      loaded += value.byteLength
      onProgress?.({ loaded, total: total || loaded })
    }
  }

  const out = new Uint8Array(loaded)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

/**
 * 加载权重：优先 IndexedDB，缺失或损坏时下载并回写。
 *
 * @returns 权重字节
 */
export async function loadWeightsCached(url: string, opts: LoadWeightsOptions): Promise<Uint8Array> {
  const { key, validate, onProgress, fetchImpl } = opts

  let db: IDBDatabase | null = null
  try {
    db = await openDb()
  } catch {
    // 缓存不可用：纯网络加载
    return download(url, onProgress, fetchImpl)
  }

  try {
    const cached = await readCache(db, key)
    if (cached && cached.byteLength > 0 && (!validate || validate(cached))) {
      onProgress?.({ loaded: cached.byteLength, total: cached.byteLength })
      return cached
    }

    // 命中但损坏 → 清掉再下
    if (cached) await deleteCache(db, key)

    const fresh = await download(url, onProgress, fetchImpl)
    if (validate && !validate(fresh)) {
      throw new Error(`下载的模型文件校验失败（${fresh.byteLength} 字节）`)
    }
    await writeCache(db, key, fresh)
    return fresh
  } finally {
    db.close()
  }
}

/** 仅供测试：清空缓存库。 */
export async function clearWeightCache(): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
    db.close()
  } catch {
    // 忽略
  }
}

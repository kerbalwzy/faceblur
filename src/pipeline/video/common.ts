/**
 * 视频处理相关的公共类型与错误，独立成模块以避免循环依赖。
 */

export class VideoCancelled extends Error {
  constructor() {
    super('处理已取消')
    this.name = 'VideoCancelled'
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new VideoCancelled()
}

export interface ProgressInfo {
  frame: number
  total: number
  /** 0–1 */
  ratio: number
}

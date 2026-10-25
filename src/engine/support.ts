/**
 * 浏览器能力探测：给出「能否运行 / 为什么慢」的可读结论。
 *
 * 用途：在加载引擎前先判断，避免用户对着无响应的进度条等待，
 * 也用于把「单线程模式」这类降级原因解释清楚（specs/face-detection）。
 */
import { checkWasmSimd, isCrossOriginIsolated } from './wasm-support'

export type SupportLevel = 'ok' | 'degraded' | 'unsupported'

export interface SupportReport {
  level: SupportLevel
  /** 不支持/降级的机器可读原因 */
  reasons: SupportReason[]
  simd: boolean
  crossOriginIsolated: boolean
  hardwareConcurrency: number
}

export type SupportReason =
  | 'no-webassembly'
  | 'no-simd'
  | 'single-thread'
  | 'old-safari'

/** 推荐浏览器版本（与设计文档保持一致）。 */
export const RECOMMENDED_BROWSERS = 'Chrome 91+、Firefox 89+、Safari 16.4+'

function hasWebAssembly(): boolean {
  return typeof WebAssembly === 'object' && typeof WebAssembly.validate === 'function'
}

/** 识别 iOS 上的第三方浏览器（它们都受系统限制，建议改用 Safari）。 */
export function isIosNonSafari(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  const isIos = /iPad|iPhone|iPod/.test(ua)
  // CriOS = Chrome, FxiOS = Firefox, EdgiOS = Edge
  const isThirdParty = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  return isIos && isThirdParty
}

/** 综合评估当前环境。 */
export function assessSupport(): SupportReport {
  const reasons: SupportReason[] = []
  const hw =
    (globalThis as unknown as { navigator?: { hardwareConcurrency?: number } }).navigator
      ?.hardwareConcurrency ?? 1

  if (!hasWebAssembly()) {
    return {
      level: 'unsupported',
      reasons: ['no-webassembly'],
      simd: false,
      crossOriginIsolated: false,
      hardwareConcurrency: hw,
    }
  }

  const simd = checkWasmSimd()
  const isolated = isCrossOriginIsolated()

  if (!simd) {
    if (isIosNonSafari()) reasons.push('old-safari')
    reasons.push('no-simd')
    return {
      level: 'unsupported',
      reasons,
      simd: false,
      crossOriginIsolated: isolated,
      hardwareConcurrency: hw,
    }
  }

  if (!isolated) reasons.push('single-thread')

  return {
    level: reasons.length > 0 ? 'degraded' : 'ok',
    reasons,
    simd,
    crossOriginIsolated: isolated,
    hardwareConcurrency: hw,
  }
}

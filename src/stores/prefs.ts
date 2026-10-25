import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { BlurStyle } from '@/pipeline/render/blur'
import type { MaskShape } from '@/pipeline/render/mask-shape'
import type { ExportFormat } from '@/pipeline/image-pipeline'

/**
 * 用户偏好：**只**允许持久化语言、主题、导出设置等非敏感配置。
 * 素材与检测结果绝不写入 localStorage（specs/privacy-local-only）。
 */

const KEY = 'faceblur:prefs'

export interface Prefs {
  style: BlurStyle
  shape: MaskShape
  strength: number
  format: ExportFormat
  quality: number
  /** 图片精度档 */
  qualityTier: 'standard' | 'high'
}

const DEFAULTS: Prefs = {
  style: 'blur',
  shape: 'rounded',
  strength: 0.6,
  format: 'image/jpeg',
  quality: 0.92,
  qualityTier: 'standard',
}

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<Prefs>
    return { ...DEFAULTS, ...sanitize(parsed) }
  } catch {
    return { ...DEFAULTS }
  }
}

/** 只接受已知字段与合法取值范围，避免被污染的 localStorage 破坏 UI。 */
function sanitize(p: Partial<Prefs>): Partial<Prefs> {
  const out: Partial<Prefs> = {}
  if (p.style === 'blur' || p.style === 'pixelate' || p.style === 'solid') out.style = p.style
  if (p.shape === 'rounded' || p.shape === 'ellipse') out.shape = p.shape
  if (typeof p.strength === 'number' && p.strength >= 0 && p.strength <= 1) out.strength = p.strength
  if (
    p.format === 'image/jpeg' ||
    p.format === 'image/png' ||
    p.format === 'image/webp'
  ) {
    out.format = p.format
  }
  if (typeof p.quality === 'number' && p.quality > 0 && p.quality <= 1) out.quality = p.quality
  if (p.qualityTier === 'standard' || p.qualityTier === 'high') out.qualityTier = p.qualityTier
  return out
}

export const usePrefsStore = defineStore('prefs', () => {
  const prefs = ref<Prefs>(load())

  watch(
    prefs,
    (value) => {
      try {
        localStorage.setItem(KEY, JSON.stringify(value))
      } catch {
        // 隐私模式下写入失败不影响使用
      }
    },
    { deep: true },
  )

  function reset(): void {
    prefs.value = { ...DEFAULTS }
  }

  return { prefs, reset }
})

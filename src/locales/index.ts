import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN.json'
import en from './en.json'

export type Locale = 'zh-CN' | 'en'

const STORAGE_KEY = 'faceblur:locale'

function detectLocale(): Locale {
  // 用户手动选择过 → 用偏好
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'zh-CN' || saved === 'en') return saved
  } catch {
    // localStorage 不可用（隐私模式）时忽略
  }
  // 否则跟随浏览器语言
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : ''
  return nav.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN, en },
})

export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // 忽略：偏好无法持久化不影响当前会话
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
  }
}

export function getLocale(): Locale {
  return i18n.global.locale.value as Locale
}

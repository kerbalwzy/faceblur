import { ref, watchEffect } from 'vue'

export type ThemeMode = 'auto' | 'light' | 'dark'

const STORAGE_KEY = 'faceblur:theme'

function readSaved(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'auto' || v === 'light' || v === 'dark') return v
  } catch {
    // 忽略
  }
  return 'auto'
}

// 模块级单例：整个应用共享同一份主题状态
const theme = ref<ThemeMode>(readSaved())

watchEffect(() => {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme.value
})

export function useTheme() {
  function setTheme(mode: ThemeMode): void {
    theme.value = mode
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // 忽略：无法持久化不影响当前会话
    }
  }
  return { theme, setTheme }
}

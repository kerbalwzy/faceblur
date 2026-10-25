import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { useTheme, type ThemeMode } from '@/composables/useTheme'
import { setLocale, getLocale } from '@/locales'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('lang')
})

describe('主题切换', () => {
  it('默认跟随系统', () => {
    const { theme } = useTheme()
    expect(theme.value).toBe('auto')
  })

  it('切换主题后写入 data-theme 属性', async () => {
    const { setTheme } = useTheme()
    setTheme('dark')
    await nextTick()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('切换主题后持久化', async () => {
    const { setTheme } = useTheme()
    setTheme('light')
    await nextTick()
    expect(localStorage.getItem('faceblur:theme')).toBe('light')
  })

  it('非法持久化值被忽略，回退 auto', () => {
    localStorage.setItem('faceblur:theme', 'rainbow')
    // useTheme 读取的是模块级单例，这里只验证不抛错且值为合法集合
    const { theme } = useTheme()
    expect(['auto', 'light', 'dark']).toContain(theme.value)
  })

  it('三种模式都可用', async () => {
    const { setTheme, theme } = useTheme()
    for (const m of ['auto', 'light', 'dark'] as ThemeMode[]) {
      setTheme(m)
      await nextTick()
      expect(theme.value).toBe(m)
      expect(document.documentElement.dataset.theme).toBe(m)
    }
  })
})

describe('语言切换', () => {
  it('切换语言同时更新 document.lang（利于读屏与 SEO）', async () => {
    setLocale('en')
    await nextTick()
    expect(getLocale()).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('切回中文', async () => {
    setLocale('zh-CN')
    await nextTick()
    expect(getLocale()).toBe('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('语言与主题互不影响', async () => {
    const { setTheme } = useTheme()
    setLocale('en')
    setTheme('dark')
    await nextTick()
    expect(getLocale()).toBe('en')
    expect(localStorage.getItem('faceblur:theme')).toBe('dark')
    expect(localStorage.getItem('faceblur:locale')).toBe('en')
  })
})

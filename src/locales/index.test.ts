import { describe, expect, it, beforeEach } from 'vitest'
import { i18n, setLocale, getLocale } from '@/locales'

describe('locales', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('默认跟随浏览器语言（jsdom 默认 en-US → 英文）', () => {
    expect(getLocale()).toBe('en')
  })

  it('切换语言后写入 localStorage 并可读回', () => {
    setLocale('zh-CN')
    expect(getLocale()).toBe('zh-CN')
    expect(localStorage.getItem('faceblur:locale')).toBe('zh-CN')
  })

  it('两种语言的文件键集合一致（避免漏翻译）', () => {
    const zh = i18n.global.getLocaleMessage('zh-CN') as Record<string, unknown>
    const en = i18n.global.getLocaleMessage('en') as Record<string, unknown>
    const flatten = (o: Record<string, unknown>, prefix = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === 'object'
          ? flatten(v as Record<string, unknown>, `${prefix}${k}.`)
          : [`${prefix}${k}`],
      )
    expect(flatten(zh).sort()).toEqual(flatten(en).sort())
  })
})

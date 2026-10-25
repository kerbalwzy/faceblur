import { describe, expect, it, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import zhCN from '@/locales/zh-CN.json'
import en from '@/locales/en.json'

import Uploader from '@/components/Uploader.vue'
import FaceList from '@/components/FaceList.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import { useSessionStore } from '@/stores/session'

function makeI18n(locale = 'zh-CN') {
  return createI18n({ legacy: false, locale, messages: { 'zh-CN': zhCN, en } })
}

function mountWith(component: Parameters<typeof mount>[0], locale = 'zh-CN') {
  return mount(component, { global: { plugins: [makeI18n(locale)] } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('Uploader（空状态）', () => {
  it('展示导入提示与格式说明', () => {
    const w = mountWith(Uploader)
    expect(w.text()).toContain('导入图片或视频')
    expect(w.text()).toContain('JPEG')
    expect(w.text()).toContain('MP4')
  })

  it('文件输入同时接受图片与视频', () => {
    const w = mountWith(Uploader)
    const accept = w.find('input[type="file"]').attributes('accept') ?? ''
    expect(accept).toContain('image/jpeg')
    expect(accept).toContain('video/mp4')
  })

  it('选择文件后触发 select 事件', async () => {
    const w = mountWith(Uploader)
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    const input = w.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    expect(w.emitted('select')).toBeTruthy()
    expect((w.emitted('select')![0][0] as File).name).toBe('a.jpg')
  })

  it('可通过键盘触发文件选择（可访问性）', async () => {
    const w = mountWith(Uploader)
    const zone = w.find('[role="button"]')
    expect(zone.attributes('tabindex')).toBe('0')
  })

  it('英文界面显示英文文案', () => {
    const w = mountWith(Uploader, 'en')
    expect(w.text()).toContain('Import an image or video')
  })
})

describe('FaceList', () => {
  function seed() {
    const s = useSessionStore()
    s.setFaces([
      { x: 0, y: 0, width: 10, height: 10, score: 0.88, kps: [] },
      { x: 20, y: 0, width: 10, height: 10, score: 0.77, kps: [] },
    ])
    return s
  }

  it('列出每张脸与置信度百分比', () => {
    seed()
    const w = mountWith(FaceList)
    expect(w.text()).toContain('检测到 2 张人脸')
    expect(w.text()).toContain('88%')
    expect(w.text()).toContain('77%')
  })

  it('勾选框反映启用状态，点击可切换', async () => {
    const s = seed()
    const w = mountWith(FaceList)
    const boxes = w.findAll('input[type="checkbox"]')
    expect(boxes).toHaveLength(2)
    expect((boxes[0].element as HTMLInputElement).checked).toBe(true)

    await boxes[0].trigger('change')
    expect(s.enabledCount).toBe(1)
  })

  it('「全不选」把所有脸关闭', async () => {
    const s = seed()
    const w = mountWith(FaceList)
    const btn = w.findAll('button').find((b) => b.text() === '全不选')!
    await btn.trigger('click')
    expect(s.enabledCount).toBe(0)
  })

  it('「全部」把所有脸打开', async () => {
    const s = seed()
    s.setAllFaces(false)
    const w = mountWith(FaceList)
    const btn = w.findAll('button').find((b) => b.text() === '全部')!
    await btn.trigger('click')
    expect(s.enabledCount).toBe(2)
  })
})

describe('SettingsPanel', () => {
  it('三种样式可切换', async () => {
    const s = useSessionStore()
    const w = mountWith(SettingsPanel)
    const pixel = w.findAll('button').find((b) => b.text() === '马赛克')!
    await pixel.trigger('click')
    expect(s.settings.style).toBe('pixelate')
  })

  it('形状可切换为椭圆', async () => {
    const s = useSessionStore()
    const w = mountWith(SettingsPanel)
    const ellipse = w.findAll('button').find((b) => b.text() === '椭圆')!
    await ellipse.trigger('click')
    expect(s.settings.shape).toBe('ellipse')
  })

  it('强度滑块与当前设置绑定', async () => {
    const s = useSessionStore()
    const w = mountWith(SettingsPanel)
    const slider = w.find('input[type="range"]')
    expect((slider.element as HTMLInputElement).value).toBe('0.6')

    await slider.setValue('0.9')
    expect(s.settings.strength).toBeCloseTo(0.9, 5)
  })

  it('当前选中样式有 aria-pressed 标记（可访问性）', () => {
    const w = mountWith(SettingsPanel)
    const blurBtn = w.findAll('button').find((b) => b.text() === '高斯模糊')!
    expect(blurBtn.attributes('aria-pressed')).toBe('true')
  })
})

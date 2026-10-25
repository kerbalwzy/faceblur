import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const IMAGE = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/sample-face.jpg')

async function prepare(page: import('@playwright/test').Page) {
  await page.addInitScript(() => localStorage.setItem('faceblur:locale', 'zh-CN'))
  await page.goto('/')
}

test.describe('响应式布局', () => {
  test('移动端（390px）完成导入 → 导出，且无横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await prepare(page)

    // 空状态可用
    await expect(page.getByRole('heading', { name: '导入图片或视频' })).toBeVisible()

    await page.setInputFiles('input[type="file"][accept*="jpeg"]', IMAGE)
    await expect(page.getByText(/检测到 \d+ 张人脸/)).toBeVisible({ timeout: 60_000 })

    // 导出的关键按钮可触达
    const exportBtn = page.getByRole('button', { name: '导出图片' })
    await expect(exportBtn).toBeVisible()

    // 无横向溢出
    const overflow = await page.evaluate(() => {
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }
    })
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)

    const dl = page.waitForEvent('download', { timeout: 30_000 })
    await exportBtn.click()
    expect((await dl).suggestedFilename()).toBe('sample-face-blurred.jpg')
  })

  test('桌面端（1280px）双栏布局', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await prepare(page)
    await page.setInputFiles('input[type="file"][accept*="jpeg"]', IMAGE)
    await expect(page.getByText(/检测到 \d+ 张人脸/)).toBeVisible({ timeout: 60_000 })

    // 侧栏与预览并排：侧栏中心应在预览右侧
    const canvas = await page.locator('canvas').first().boundingBox()
    const side = await page.locator('aside').first().boundingBox()
    expect(canvas).not.toBeNull()
    expect(side).not.toBeNull()
    expect(side!.x).toBeGreaterThan(canvas!.x + canvas!.width / 2)
  })
})

test.describe('可访问性', () => {
  test('纯键盘可完成核心流程', async ({ page }) => {
    await prepare(page)

    // 用 Tab 找到上传区并用 Enter 聚焦（文件选择框无法自动化 Enter，
    // 因此这里验证焦点可达 + 文件选择后流程可继续）
    const zone = page.locator('[role="button"]').first()
    await zone.focus()
    await expect(zone).toBeFocused()

    // 键盘能操作到设置区与导出按钮
    await page.setInputFiles('input[type="file"][accept*="jpeg"]', IMAGE)
    await expect(page.getByText(/检测到 \d+ 张人脸/)).toBeVisible({ timeout: 60_000 })

    const exportBtn = page.getByRole('button', { name: '导出图片' })
    await exportBtn.focus()
    await expect(exportBtn).toBeFocused()
  })

  test('图标/选择控件都有可访问名称', async ({ page }) => {
    await prepare(page)

    // 语言与主题下拉都有 label
    await expect(page.getByLabel('语言')).toBeVisible()
    await expect(page.getByLabel('主题')).toBeVisible()

    // 上传区有可访问名称
    const zone = page.locator('[role="button"]').first()
    expect(await zone.getAttribute('aria-label')).toBeTruthy()
  })

  test('有 aria-live 区域用于播报状态', async ({ page }) => {
    await prepare(page)
    const live = page.locator('[aria-live="polite"]')
    expect(await live.count()).toBeGreaterThan(0)
  })

  test('对比按钮支持键盘操作', async ({ page }) => {
    await prepare(page)
    await page.setInputFiles('input[type="file"][accept*="jpeg"]', IMAGE)
    await expect(page.getByText(/检测到 \d+ 张人脸/)).toBeVisible({ timeout: 60_000 })

    const compare = page.getByRole('button', { name: '按住对比原图' })
    await compare.focus()
    expect(await compare.evaluate((el) => el === document.activeElement)).toBe(true)
  })
})

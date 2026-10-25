import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/sample-face.jpg')

/** 语言偏好会持久化，测试前先固定为中文，避免受上一个用例影响。 */
async function prepare(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('faceblur:locale', 'zh-CN')
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '导入图片' })).toBeVisible()
}

test.describe('图片处理流程', () => {
  test('导入 → 检测 → 切换样式 → 导出（文件名与尺寸正确）', async ({ page }) => {
    await prepare(page)

    await page.setInputFiles('input[type="file"][accept*="jpeg"]', FIXTURE)
    await expect(page.getByText(/检测到 \d+ 张人脸/)).toBeVisible({ timeout: 60_000 })

    const canvas = page.locator('canvas').first()
    await expect(canvas).toBeVisible()
    const size = await canvas.evaluate((el: HTMLCanvasElement) => ({ w: el.width, h: el.height }))
    expect(size.w).toBeGreaterThan(100)
    expect(size.h).toBeGreaterThan(100)

    await page.getByRole('button', { name: '马赛克' }).click()

    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 })
    await page.getByRole('button', { name: '导出图片' }).click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toBe('sample-face-blurred.jpg')

    // 导出图必须保持原始尺寸 512×512
    const path = await download.path()
    expect(path).toBeTruthy()
    const fs = await import('node:fs/promises')
    const buf = await fs.readFile(path!)
    const dims = await page.evaluate(async (b64) => {
      const img = new Image()
      img.src = `data:image/jpeg;base64,${b64}`
      await img.decode()
      return { w: img.naturalWidth, h: img.naturalHeight }
    }, buf.toString('base64'))
    expect(dims).toEqual({ w: 512, h: 512 })
  })

  test('逐脸开关生效：全不选后遮挡数量归零', async ({ page }) => {
    await prepare(page)
    await page.setInputFiles('input[type="file"][accept*="jpeg"]', FIXTURE)
    await expect(page.getByText(/检测到 \d+ 张人脸/)).toBeVisible({ timeout: 60_000 })

    const summary = page.getByText(/已遮挡 \d+ 张/)
    await expect(summary).toContainText('1')

    await page.getByRole('button', { name: '全不选' }).click()
    await expect(summary).toContainText('0')

    await page.getByRole('button', { name: '全部' }).click()
    await expect(summary).toContainText('1')
  })

  test('语言切换后持久化（新页面仍为英文）', async ({ page, context }) => {
    await prepare(page)
    await page.selectOption('#locale-select', 'en')
    await expect(page.getByRole('heading', { name: 'Import an image' })).toBeVisible()

    // 换一个不带 addInitScript 的新页面打开同一 context（共享 localStorage），
    // 验证语言确实被持久化，而不是被初始化脚本覆盖。
    const fresh = await context.newPage()
    await fresh.goto('/')
    await expect(fresh.getByRole('heading', { name: 'Import an image' })).toBeVisible()
    expect(await fresh.evaluate(() => localStorage.getItem('faceblur:locale'))).toBe('en')
    await fresh.close()
  })

  test('画布在遮挡前后像素有变化（确实画了模糊）', async ({ page }) => {
    await prepare(page)
    await page.setInputFiles('input[type="file"][accept*="jpeg"]', FIXTURE)
    await expect(page.getByText(/检测到 \d+ 张人脸/)).toBeVisible({ timeout: 60_000 })

    const sample = async () =>
      page.evaluate(() => {
        const c = document.querySelector('canvas') as HTMLCanvasElement
        const ctx = c.getContext('2d')!
        // 取人脸中心区域的像素做指纹
        const d = ctx.getImageData(c.width * 0.4, c.height * 0.35, 60, 60).data
        let sum = 0
        for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]
        return sum
      })

    // 有遮挡时的像素指纹
    await page.waitForTimeout(300)
    const blurred = await sample()

    // 用「全不选」关掉遮挡，得到清晰的原始像素。
    // 比触发 pointerdown/pointerup 更稳定（指针事件在快速连续运行时可能丢失），
    // 也更直接地验证「遮挡确实改变了画面」。
    await page.getByRole('button', { name: '全不选' }).click()
    await page.waitForTimeout(300)
    const original = await sample()

    expect(blurred).toBeGreaterThan(0)
    expect(original).toBeGreaterThan(0)
    // 两者必须不同：说明遮挡真的画上去了
    expect(blurred).not.toBe(original)
  })
})

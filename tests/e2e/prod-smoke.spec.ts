import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const IMAGE = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/sample-face.jpg')

/**
 * 生产构建冒烟：在真实构建产物上跑一次检测。
 *
 * 为什么需要这个文件（踩坑记录）：
 *   ORT 的 WASM 加载依赖路径解析，dev 与生产的表现**不同**。
 *   我们曾出现过「dev 通过、生产静默失败（检测结果为空）」的情况，
 *   以及反向的「生产修好、dev 弄坏」。因此两种模式都必须有测试。
 *
 * 本文件用 playwright.offline.config.ts 运行（生产构建 + preview）。
 */
test.describe('生产构建', () => {
  test('能加载引擎并检出人脸（回归：ORT 路径解析）', async ({ page }) => {
    test.setTimeout(180_000)

    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('faceblur:locale', 'zh-CN'))
    await page.reload()

    await page.setInputFiles('input[type="file"][accept*="jpeg"]', IMAGE)

    // 必须真的检出人脸，而不是静默返回空
    await expect(page.getByText(/检测到 \d+ 张人脸/)).toBeVisible({ timeout: 120_000 })

    // 且不能有 WASM 加载类错误
    const wasmErrors = errors.filter(
      (e) => /wasm|backend|Failed to fetch dynamically imported/i.test(e) && !/favicon/i.test(e),
    )
    expect(wasmErrors, `生产构建出现运行时错误：${wasmErrors.join('\n')}`).toEqual([])
  })

  test('能导出并下载结果图片', async ({ page }) => {
    test.setTimeout(180_000)
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('faceblur:locale', 'zh-CN'))
    await page.reload()

    await page.setInputFiles('input[type="file"][accept*="jpeg"]', IMAGE)
    await expect(page.getByText(/检测到 \d+ 张人脸/)).toBeVisible({ timeout: 120_000 })

    const dl = page.waitForEvent('download', { timeout: 60_000 })
    await page.getByRole('button', { name: '导出图片' }).click()
    expect((await dl).suggestedFilename()).toBe('sample-face-blurred.jpg')
  })
})

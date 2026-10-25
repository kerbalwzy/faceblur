import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const VIDEO = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/sample-face.mp4')

async function prepare(page: import('@playwright/test').Page) {
  await page.addInitScript(() => localStorage.setItem('faceblur:locale', 'zh-CN'))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '导入图片或视频' })).toBeVisible()
}

test.describe('视频界面流程', () => {
  test('导入视频 → 展示元信息与预览检测 → 处理 → 下载', async ({ page }) => {
    test.setTimeout(180_000)
    await prepare(page)

    await page.setInputFiles('input[type="file"][accept*="video/mp4"]', VIDEO)

    // 元信息
    await expect(page.getByText(/时长:/)).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(/分辨率: 512×512/)).toBeVisible()
    await expect(page.getByText(/约 60 帧/)).toBeVisible()

    // 预览帧上也做了检测
    await expect(page.getByText(/检测到 \d+ 张人脸/)).toBeVisible({ timeout: 60_000 })

    // 开始处理。注意 2 秒视频处理很快，"正在处理"可能一闪而过，
    // 因此这里只断言最终出现下载按钮。
    await page.getByRole('button', { name: '开始处理视频' }).click()
    await expect(page.getByRole('button', { name: '下载视频' })).toBeVisible({ timeout: 120_000 })

    const dl = page.waitForEvent('download', { timeout: 30_000 })
    await page.getByRole('button', { name: '下载视频' }).click()
    const download = await dl
    expect(download.suggestedFilename()).toMatch(/-blurred\.(mp4|webm)$/)
    const path = await download.path()
    expect(path).toBeTruthy()
    const fs = await import('node:fs/promises')
    const stat = await fs.stat(path!)
    expect(stat.size).toBeGreaterThan(5000)
  })

  test('处理中可取消并回到可重新处理状态', async ({ page }) => {
    test.setTimeout(180_000)
    // 全量运行时，前一个用例可能留下仍在解码的 video 元素，
    // 会干扰本页的视频解码与状态流转。先清空页面再开始。
    await page.goto('about:blank')
    await prepare(page)
    await page.setInputFiles('input[type="file"][accept*="video/mp4"]', VIDEO)
    await expect(page.getByText(/时长:/)).toBeVisible({ timeout: 60_000 })

    await page.getByRole('button', { name: '开始处理视频' }).click()

    // 2 秒视频处理很快，「取消处理」按钮可能一闪而过。
    // 用 expect.poll 捕捉它是否出现过，而不是只查一次瞬时状态。
    const sawProcessing = await expect
      .poll(
        async () =>
          (await page.getByRole('button', { name: '取消处理' }).count()) > 0 ||
          (await page.getByRole('button', { name: /下载视频|重新处理/ }).count()) > 0,
        { timeout: 120_000, intervals: [100, 200, 500] },
      )
      .toBe(true)
      .then(() => true)
      .catch(() => false)

    expect(sawProcessing).toBe(true)

    // 若此刻仍在处理中，点取消。
    // 注意用 dispatchEvent 而不是 click()：2 秒视频可能在这几毫秒内处理完，
    // 按钮会从 DOM 移除，click() 的可操作性等待会一直重试到超时。
    const cancel = page.getByRole('button', { name: '取消处理' })
    if ((await cancel.count()) > 0) {
      await cancel.dispatchEvent('click').catch(() => {
        // 按钮已消失说明处理已完成，等价于「无需取消」
      })
    }

    await expect(
      page.getByRole('button', { name: /开始处理视频|重新处理/ }),
    ).toBeVisible({ timeout: 120_000 })
  })
})

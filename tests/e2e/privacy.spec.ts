import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const IMAGE = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/sample-face.jpg')

/** 语言偏好会跨用例持久化，统一固定为中文避免断言错乱。 */
/** 请求监听器必须在用例结束时移除，否则会在同一 page 上累积并拖慢后续用例。 */
function trackRequests(page: import('@playwright/test').Page): { urls: string[]; stop: () => void } {
  const urls: string[] = []
  const handler = (req: import('@playwright/test').Request) => urls.push(req.url())
  page.on('request', handler)
  return { urls, stop: () => page.off('request', handler) }
}

async function open(page: import('@playwright/test').Page) {
  await page.addInitScript(() => localStorage.setItem('faceblur:locale', 'zh-CN'))
  await page.goto('/')
}

/** 隐私说明文案（中文/英文都接受，避免语言偏好影响断言）。 */
const PRIVACY_TEXT = /不会上传|never uploaded/i

/**
 * 隐私承诺的可验证断言（specs/privacy-local-only）。
 *
 * 这是产品最核心的承诺，必须由测试强制保证：
 *   1. 处理过程中不向任何外部域名发送素材；
 *   2. 处理后刷新页面，素材不会被恢复；
 *   3. 没有任何业务后端接口。
 */

/**
 * 判断一个请求是否「允许」。
 *
 * 允许：同源静态资源、以及页面自己创建的 blob:/data: URL
 * （这两类是本地的 objectURL，视频源与导出结果就是 blob URL，不涉及网络）。
 */
function isAllowedRequest(url: string, base: string): boolean {
  // 本地生成的 URL：不会离开设备
  if (url.startsWith('blob:') || url.startsWith('data:')) return true
  try {
    const u = new URL(url, base)
    const b = new URL(base)
    return u.origin === b.origin
  } catch {
    return false
  }
}

test.describe('零上传', () => {
  test('图片处理全程只请求同域静态资源', async ({ page }) => {
    const track = trackRequests(page)

    await open(page)
    await page.setInputFiles('input[type="file"][accept*="jpeg"]', IMAGE)
    await expect(page.getByText(/检测到 \d+ 张人脸/)).toBeVisible({ timeout: 60_000 })

    // 执行导出，覆盖完整链路
    const dl = page.waitForEvent('download', { timeout: 30_000 })
    await page.getByRole('button', { name: '导出图片' }).click()
    await dl

    const base = page.url()
    const external = track.urls.filter((u) => !isAllowedRequest(u, base))
    track.stop()

    // 关键断言：不存在任何外部请求
    expect(external, `发现外部请求：${external.join(', ')}`).toEqual([])
  })

  test('视频处理全程只请求同域静态资源', async ({ page }) => {
    // 记录全量请求会带来额外开销，放宽超时
    test.setTimeout(300_000)
    const VIDEO = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/sample-face.mp4')
    const track = trackRequests(page)

    await open(page)
    await page.setInputFiles('input[type="file"][accept*="video/mp4"]', VIDEO)
    await expect(page.getByText(/时长:/)).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: '开始处理视频' }).click()

    // 用间隔轮询等待完成。
    // 注意不能用 waitForFunction / toBeVisible 的持续轮询：
    // 它们会向页面注入周期性脚本，而视频处理正占满主线程，
    // 反而让处理迟迟无法推进（实测会卡到超时）。
    let finished = false
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(1000)
      if ((await page.locator('body').innerText()).includes('下载视频')) {
        finished = true
        break
      }
    }
    expect(finished, '视频处理未在 120 秒内完成').toBe(true)

    const base = page.url()
    const external = track.urls.filter((u) => !isAllowedRequest(u, base))
    track.stop()
    expect(external, `发现外部请求：${external.join(', ')}`).toEqual([])
  })

  test('所有请求都是静态资源（无业务 API 调用）', async ({ page }) => {
    const apiLike: string[] = []
    page.on('request', (req) => {
      const url = new URL(req.url())
      // 只关心真正的业务接口路径；排除：
      //   - Vite 开发服务器内部请求（/@vite, /node_modules/.vite）
      //   - 本项目自己的源码/Worker 模块（/src/**，dev 模式下按路径加载）
      const isDevInternal =
        url.pathname.startsWith('/@') ||
        url.pathname.startsWith('/node_modules/') ||
        url.pathname.startsWith('/src/')
      if (isDevInternal) return

      if (/\/(api|upload|analyze)\b/.test(url.pathname)) {
        apiLike.push(req.url())
      }
    })

    await open(page)
    await page.setInputFiles('input[type="file"][accept*="jpeg"]', IMAGE)
    await expect(page.getByText(/检测到 \d+ 张人脸/)).toBeVisible({ timeout: 60_000 })

    expect(apiLike).toEqual([])
  })
})

test.describe('无持久留存', () => {
  test('刷新后素材不会恢复', async ({ page }) => {
    await open(page)
    await page.setInputFiles('input[type="file"][accept*="jpeg"]', IMAGE)
    await expect(page.getByText(/检测到 \d+ 张人脸/)).toBeVisible({ timeout: 60_000 })

    // 刷新
    await page.reload()

    // 应回到空状态，而不是恢复素材
    await expect(page.getByRole('heading', { name: '导入图片或视频' })).toBeVisible()
    await expect(page.locator('canvas')).toHaveCount(0)
  })

  test('localStorage 中不含素材或人脸坐标', async ({ page }) => {
    await open(page)
    await page.setInputFiles('input[type="file"][accept*="jpeg"]', IMAGE)
    await expect(page.getByText(/检测到 \d+ 张人脸/)).toBeVisible({ timeout: 60_000 })

    const dump = await page.evaluate(() => {
      const out: Record<string, string> = {}
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!
        out[k] = localStorage.getItem(k) ?? ''
      }
      return JSON.stringify(out)
    })

    // 不含文件名
    expect(dump).not.toContain('sample-face')
    // 不含 base64 图片数据
    expect(dump).not.toContain('data:image')
    // 不含 blob URL（素材引用）
    expect(dump).not.toContain('blob:')
    // 只允许出现偏好键
    const keys = Object.keys(JSON.parse(dump))
    for (const k of keys) {
      expect(['faceblur:prefs', 'faceblur:locale', 'faceblur:theme']).toContain(k)
    }
  })

  test('IndexedDB 中只有模型权重，没有素材', async ({ page }) => {
    await open(page)
    await page.setInputFiles('input[type="file"][accept*="jpeg"]', IMAGE)
    await expect(page.getByText(/检测到 \d+ 张人脸/)).toBeVisible({ timeout: 60_000 })

    const dbs = await page.evaluate(async () => {
      const list = (await indexedDB.databases?.()) ?? []
      return list.map((d) => d.name)
    })
    // 只允许模型缓存库
    for (const name of dbs) {
      expect(['faceblur', 'facex-cache']).toContain(name)
    }
  })
})

test.describe('隐私说明可见', () => {
  test('首屏即可看到本地处理说明', async ({ page }) => {
    await open(page)
    // 不需要滚动、不需要点开任何设置
    await expect(page.getByText(PRIVACY_TEXT)).toBeVisible()
  })

  test('页脚列明模型与运行时来源', async ({ page }) => {
    await open(page)
    const footer = page.locator('footer')
    await expect(footer).toContainText('YuNet')
    await expect(footer).toContainText('MIT')
    await expect(footer).toContainText('onnxruntime-web')
  })
})

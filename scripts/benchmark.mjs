#!/usr/bin/env node
/**
 * 性能基准（docs/limitations.md 的数据来源）。
 *
 * 用法：
 *   npm run build
 *   npm run preview -- --port 4175 &
 *   npm run benchmark -- --url http://127.0.0.1:4175
 *
 * 也支持 dev server（会额外测到源码模块）。
 * 输出可粘贴进文档的 Markdown 表格，并写入 docs/benchmark-latest.md。
 */
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const argUrl = process.argv.indexOf('--url')
const BASE = argUrl > -1 ? process.argv[argUrl + 1] : 'http://127.0.0.1:4175'
const FIXTURE = join(ROOT, 'tests', 'fixtures', 'sample-face.jpg')
const VIDEO = join(ROOT, 'tests', 'fixtures', 'sample-face.mp4')

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  const consoleErrors = []
  page.on('pageerror', (e) => consoleErrors.push(e.message))

  await page.goto(BASE)
  await page.evaluate(() => localStorage.setItem('faceblur:locale', 'zh-CN'))
  await page.reload()

  // 环境信息
  const env = await page.evaluate(() => ({
    ua: navigator.userAgent,
    cores: navigator.hardwareConcurrency,
    isolated: globalThis.crossOriginIsolated === true,
    memory: navigator.deviceMemory ?? null,
  }))

  // ---- 图片端到端：从导入到检出完毕 ----
  const tImage = Date.now()
  await page.setInputFiles('input[type="file"][accept*="jpeg"]', FIXTURE)
  await page.getByText(/检测到 \d+ 张人脸|未检测到人脸/).first().waitFor({ timeout: 120_000 })
  const imageMs = Date.now() - tImage

  // 导出耗时
  const tExport = Date.now()
  const dl = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: '导出图片' }).click()
  await dl
  const exportMs = Date.now() - tExport

  // ---- 视频端到端 ----
  await page.goto(BASE)
  const tVideo = Date.now()
  await page.setInputFiles('input[type="file"][accept*="video/mp4"]', VIDEO)
  await page.getByText(/时长:/).waitFor({ timeout: 60_000 })
  await page.getByRole('button', { name: '开始处理视频' }).click()

  // 轮询等待完成（避免持续轮询拖慢处理）
  let done = false
  for (let i = 0; i < 180; i++) {
    await page.waitForTimeout(1000)
    if ((await page.locator('body').innerText()).includes('下载视频')) {
      done = true
      break
    }
  }
  const videoMs = Date.now() - tVideo

  const videoMeta = await page.evaluate(() => {
    const t = document.body.innerText
    const m = t.match(/约 (\d+) 帧/)
    return { frames: m ? Number(m[1]) : null }
  })

  await browser.close()

  const isProdBuild = !BASE.includes(':5173')

  const md = `## 基准结果

- 时间：${new Date().toISOString().slice(0, 10)}
- 构建：${isProdBuild ? '生产（preview）' : '开发（dev）'}
- 环境：${env.ua}
- CPU 并发：${env.cores}
- 跨源隔离（多线程前提）：${env.isolated ? '是' : '否'}

| 项目 | 耗时 |
|---|---|
| 图片（512×512）导入 → 检出完成 | ${imageMs} ms |
| 图片导出 | ${exportMs} ms |
| 视频（512×512 / 2 秒 / ${videoMeta.frames ?? '?'} 帧）完整处理${done ? '' : '（未完成）'} | ${videoMs} ms |
| 视频处理倍率（相对素材时长 2 秒） | ${(videoMs / 2000).toFixed(2)}× |

> 图片用例首次运行包含引擎初始化（WASM 加载 + 模型下载/会话创建），
> 二次运行会明显更快。
`

  console.log(md)
  const out = join(ROOT, 'docs', 'benchmark-latest.md')
  writeFileSync(out, md)
  console.log(`已写入 ${out}`)

  if (consoleErrors.length > 0) {
    console.log(`\n页面错误（${consoleErrors.length}）：`)
    for (const e of consoleErrors.slice(0, 5)) console.log(' -', e.slice(0, 150))
  }
}

main().catch((err) => {
  console.error('基准测试失败：', err.message)
  process.exit(1)
})

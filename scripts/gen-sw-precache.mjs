/**
 * 构建期生成 Service Worker 的预缓存清单。
 *
 * 问题：SW 在首次访问时还没接管页面，因此首次加载的 JS/CSS 不会经过 fetch 事件，
 * 也就不会被缓存。等用户断网重载时，HTML 有了、依赖资源却没有 → 白屏。
 *
 * 解法：构建后扫描 dist 产物，把实际的资源列表写入 sw.js 的预缓存清单，
 * 这样 SW 安装时就能一次性缓存全部必需资源。
 */
import { readdir, readFile, writeFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const SW = join(DIST, 'sw.js')

/** 预缓存：页面必需资源。模型与 wasm 体积大，改为运行时缓存。 */
function isPrecachable(rel) {
  if (rel === 'sw.js') return false
  // 模型与 ORT 二进制走运行时缓存，避免拖慢首次安装
  if (/^models\//.test(rel)) return false
  if (/\.wasm$/.test(rel)) return false
  return /\.(js|css|html|svg|ico|json|mjs)$/.test(rel) || rel === ''
}

async function walk(dir, acc = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await walk(full, acc)
    else acc.push(full)
  }
  return acc
}

async function main() {
  try {
    await stat(DIST)
  } catch {
    console.log('dist 不存在，跳过（请先执行构建）')
    return
  }

  const files = await walk(DIST)
  const urls = files
    .map((f) => relative(DIST, f).split('\\').join('/'))
    .filter(isPrecachable)
    .map((rel) => (rel === 'index.html' ? '/' : `/${rel}`))

  // 补上根路径
  if (!urls.includes('/')) urls.unshift('/')

  const sw = await readFile(SW, 'utf8')
  const marker = '/* __PRECACHE__ */'
  const replacement = `const PRECACHE = ${JSON.stringify(urls, null, 2)};`

  if (!sw.includes(marker)) {
    throw new Error('sw.js 中缺少 /* __PRECACHE__ */ 标记')
  }

  await writeFile(SW, sw.replace(marker, replacement))
  console.log(`已注入预缓存清单：${urls.length} 个资源`)
}

main().catch((err) => {
  console.error('生成预缓存清单失败：', err.message)
  process.exit(1)
})

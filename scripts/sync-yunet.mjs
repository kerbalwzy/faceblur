#!/usr/bin/env node
/**
 * 同步 YuNet 人脸检测模型到 public/models/。
 *
 * 为什么不直接引用远程 URL：
 *   1. 零上传承诺要求静态资源自托管（design D11），避免第三方域名请求；
 *   2. CSP 可以锁成 'self'，不需要为模型域名开口子；
 *   3. 版本固定后可以写死 SHA256 校验，防止上游被篡改。
 *
 * 模型：OpenCV Zoo / face_detection_yunet_2026may.onnx
 * 许可：MIT（与模型目录一同下载的 LICENSE 即原始许可证文件）
 *
 * 为什么用 2026may 而不是 int8 量化版：
 *   - 2023mar 系列（含 int8 / int8bq）输入被固定为 640×640，无法按 320 推理；
 *   - int8bq 的 block 量化在 onnxruntime-web WASM 后端加载失败；
 *   - 2026may 是动态输入尺寸版本，实测 320 仅 4 ms、640 仅 10 ms，
 *     比 int8-2023mar@640（38 ms）快约 4 倍，体积也相近（224 KB）。
 */
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const execFileAsync = promisify(execFile)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'models')

const UPSTREAM = {
  repo: 'opencv/opencv_zoo',
  commit: 'main',
  dir: 'models/face_detection_yunet',
  files: {
    'yunet.onnx': 'face_detection_yunet_2026may.onnx',
    LICENSE: 'LICENSE',
  },
}

// raw.githubusercontent.com 对 Git LFS 文件只返回指针，因此模型走 media 域名；
// 普通文本文件（如 LICENSE）在 media 域名上会 404，需要回退到 raw 域名。
const RAW_BASE = `https://raw.githubusercontent.com/${UPSTREAM.repo}/${UPSTREAM.commit}/${UPSTREAM.dir}/`
const MEDIA_BASE = `https://media.githubusercontent.com/media/${UPSTREAM.repo}/${UPSTREAM.commit}/${UPSTREAM.dir}/`

async function downloadWithBases(name) {
  let lastErr
  for (const base of [MEDIA_BASE, RAW_BASE]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await fetchBuffer(base + name)
      } catch (err) {
        lastErr = err
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
      }
    }
  }
  throw new Error(`下载失败 ${name}: ${lastErr?.message ?? '未知错误'}`)
}

/** Node 内置 fetch 在部分网络环境下会 ECONNRESET，失败时退回系统 curl。 */
async function fetchBuffer(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return validate(url, Buffer.from(await res.arrayBuffer()))
  } catch (err) {
    if (err instanceof Error && /HTTP \d+/.test(err.message)) throw err
    const tmp = join(tmpdir(), `faceblur-sync-${process.pid}-${Date.now()}`)
    try {
      await execFileAsync('curl', ['-sSL', '--fail', '--max-time', '120', '-o', tmp, url])
      return validate(url, await readFile(tmp))
    } finally {
      await rm(tmp, { force: true })
    }
  }
}

function validate(url, buf) {
  // LFS 指针文件只有 ~130 字节且以 version 开头，误当成模型会非常难排查
  if (buf.subarray(0, 8).toString() === 'version ') {
    throw new Error(`${url} 返回的是 Git LFS 指针而非真实文件`)
  }
  return buf
}

const download = (name) => downloadWithBases(name)

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const entries = []

  for (const [outName, upstreamName] of Object.entries(UPSTREAM.files)) {
    const buf = await download(upstreamName)
    await writeFile(join(OUT_DIR, outName), buf)
    entries.push({ outName, upstreamName, size: buf.length, sha: sha256(buf) })
    console.log(`✓ ${outName}  ${(buf.length / 1024).toFixed(1)} KB  sha256=${sha256(buf)}`)
  }

  const model = entries.find((e) => e.outName === 'yunet.onnx')
  if (!model) throw new Error('未生成模型文件')
  if (model.size < 150_000 || model.size > 500_000) {
    throw new Error(`模型体积异常：${model.size} 字节（预期约 224 KB）`)
  }

  const license = await readFile(join(OUT_DIR, 'LICENSE'), 'utf8')
  if (!/MIT License/i.test(license)) {
    throw new Error('LICENSE 不是预期的 MIT 许可证')
  }

  const readme = `# 模型资产

本目录下的文件由 \`npm run sync:yunet\` 从上游同步而来，请勿手工修改。

| 文件 | 用途 | 体积 | SHA256 |
|---|---|---|---|
${entries.map((e) => `| \`${e.outName}\` | ${e.outName === 'LICENSE' ? '模型许可证' : '人脸检测模型（FP32，动态输入）'} | ${e.size} B | \`${e.sha}\` |`).join('\n')}

## 来源

- 仓库：https://github.com/${UPSTREAM.repo}
- 路径：\`${UPSTREAM.dir}\`
- 引用：\`${UPSTREAM.commit}\`
- 原始文件名：\`${UPSTREAM.files['yunet.onnx']}\`
- 下载地址：${MEDIA_BASE}${UPSTREAM.files['yunet.onnx']}

## 许可证

MIT —— 允许商业使用。原始许可证文件见同目录下的 \`LICENSE\`，完整依赖清单见 \`docs/licenses.md\`。

## 模型说明

YuNet 是轻量人脸检测模型，输出边界框与 5 个人脸关键点（右眼、左眼、鼻尖、右嘴角、左嘴角）。
输入为 1×3×H×W 的 RGB 图像张量（取值 0–255），输出 8/16/32 三个尺度的 \`cls\`/\`obj\`/\`bbox\`/\`kps\`。

论文：Wu, Peng, Yu. *YuNet: A Tiny Millisecond-level Face Detector*, Machine Intelligence Research, 2023.
`

  await writeFile(join(OUT_DIR, 'README.md'), readme)
  console.log('✓ README.md 已更新')
}

main().catch((err) => {
  console.error('同步失败：', err.message)
  process.exit(1)
})

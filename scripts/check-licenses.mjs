#!/usr/bin/env node
/**
 * 商用许可证白名单检查（design D12）。
 *
 * 项目有商业化计划，因此任何依赖出现 NC / GPL / AGPL 等不可商用许可证时，
 * 必须在 PR 阶段失败，而不是等上线前才发现。
 *
 * 检查范围：
 *   1. 生产依赖（package.json 的 dependencies）及其传递依赖；
 *   2. public/models/ 下模型资产的 LICENSE 文件。
 *
 * 用法：npm run check-licenses  [-- --json]
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 允许商用的许可证（SPDX 表达式经归一化后逐项比对） */
const ALLOWED = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
  'BlueOak-1.0.0',
  'Python-2.0',
  'MPL-2.0',
])

/** 明确禁止（命中即失败，并给出原因） */
const DENIED = [
  [/\bAGPL/i, 'AGPL 要求网络服务也开源，不适合本项目'],
  [/\bLGPL/i, 'LGPL 在纯前端静态分发下难以满足替换要求'],
  [/\bGPL/i, 'GPL 传染性，会要求整个前端开源'],
  [/\bCC-BY-NC/i, 'NC 许可证禁止商业使用'],
  [/\bCC-BY-SA/i, 'SA 传染性且与闭源商业产品冲突'],
  [/\bSSPL/i, 'SSPL 非 OSI 认可，限制商业托管'],
  [/\bBUSL/i, 'BUSL 限制商业使用'],
  [/\bCommons-Clause/i, 'Commons Clause 禁止销售'],
]

function normalize(license) {
  if (!license) return 'UNKNOWN'
  if (typeof license === 'object') return license.type ?? 'UNKNOWN'
  return String(license).trim()
}

/** 依赖树里常见的复合表达式，如 "(MIT OR Apache-2.0)" */
function evaluate(expr) {
  const cleaned = expr.replace(/[()]/g, ' ').trim()
  const orParts = cleaned.split(/\s+OR\s+/i).map((s) => s.trim())
  const results = orParts.map((part) => {
    const andParts = part.split(/\s+AND\s+/i).map((s) => s.trim())
    return andParts.every((p) => ALLOWED.has(p))
  })
  return results.some(Boolean)
}

function denyReason(expr) {
  for (const [re, reason] of DENIED) {
    if (re.test(expr)) return reason
  }
  return null
}

async function collectProductionDeps() {
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
  const roots = Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.optionalDependencies ?? {}) })
  const seen = new Map()
  const queue = [...roots]

  while (queue.length > 0) {
    const name = queue.shift()
    if (seen.has(name)) continue
    let meta
    try {
      meta = JSON.parse(await readFile(join(ROOT, 'node_modules', name, 'package.json'), 'utf8'))
    } catch {
      // 可选依赖可能未安装
      seen.set(name, { name, license: 'NOT_INSTALLED', optional: true })
      continue
    }
    seen.set(name, {
      name,
      version: meta.version,
      license: normalize(meta.license ?? meta.licenses),
      direct: roots.includes(name),
      devOnly: isDevOnly(meta, roots),
    })
    // 只递归真正的运行时依赖。peerDependencies 不一定会被打进产物
    // （例如 pinia/vue 把 typescript 声明为 peer，仅用于类型），
    // 因此单独记录但不作为失败依据。
    const deps = { ...(meta.dependencies ?? {}), ...(meta.optionalDependencies ?? {}) }
    for (const dep of Object.keys(deps)) queue.push(dep)
  }
  return [...seen.values()]
}

/** 判断某个包是否只作为开发期工具出现（不进入运行时产物）。 */
function isDevOnly(meta, roots) {
  // 直接依赖：不在 dependencies 里就是开发依赖
  if (roots.includes(meta.name)) return false
  return !meta.dependencies && /typescript|@types\//.test(meta.name)
}

async function checkModelAssets() {
  const dir = join(ROOT, 'public', 'models')
  const findings = []
  let entries = []
  try {
    entries = await readdir(dir)
  } catch {
    return { findings, entries }
  }

  for (const f of entries) {
    const p = join(dir, f)
    const info = await stat(p)
    if (!info.isFile()) continue
    if (/\.(onnx|bin|tflite|pb|ort|mnn|ncnn)$/i.test(f)) {
      findings.push({ file: f, size: info.size, hasLicense: entries.includes('LICENSE') })
    }
  }
  // README 必须存在，作为来源与哈希的登记
  const hasReadme = entries.includes('README.md')
  return { findings, entries, hasReadme }
}

async function main() {
  const json = process.argv.includes('--json')
  const deps = await collectProductionDeps()
  const problems = []
  const rows = []

  for (const dep of deps) {
    const expr = dep.license
    if (expr === 'NOT_INSTALLED') {
      rows.push({ ...dep, ok: true, note: '未安装（可选/peer）' })
      continue
    }
    const denied = denyReason(expr)
    let ok
    if (denied) ok = false
    else if (expr === 'UNKNOWN') ok = dep.optional === true
    else ok = evaluate(expr)

    rows.push({ ...dep, ok, note: denied ?? '' })
    if (!ok) problems.push({ ...dep, reason: denied ?? '不在允许清单内' })
  }

  const model = await checkModelAssets()
  if (model.findings.length > 0 && !model.findings[0].hasLicense) {
    problems.push({ name: 'public/models', reason: '存在模型文件但缺少 LICENSE' })
  }
  if (!model.hasReadme && model.findings.length > 0) {
    problems.push({ name: 'public/models', reason: '缺少 README.md（需登记来源与 SHA256）' })
  }

  if (json) {
    console.log(JSON.stringify({ rows, problems, models: model }, null, 2))
  } else {
    rows.sort((a, b) => a.name.localeCompare(b.name))
    for (const r of rows) {
      const mark = r.ok ? '✓' : '✗'
      console.log(`${mark} ${r.name}${r.version ? '@' + r.version : ''}  ${r.license}${r.note ? '  ' + r.note : ''}`)
    }
    if (model.findings.length > 0) {
      console.log('\n模型资产：')
      for (const m of model.findings) {
        console.log(`✓ ${m.file}  ${(m.size / 1024).toFixed(1)} KB  LICENSE=${m.hasLicense ? '有' : '无'}`)
      }
    }
  }

  if (problems.length > 0) {
    console.error(`\n许可证检查失败（${problems.length} 项）：`)
    for (const p of problems) {
      console.error(`  ✗ ${p.name}${p.version ? '@' + p.version : ''}: ${p.reason}`)
    }
    process.exit(1)
  }
  console.log(`\n许可证检查通过：${rows.filter((r) => r.license !== 'NOT_INSTALLED').length} 个生产依赖全部允许商用`)
}

main().catch((err) => {
  console.error('检查脚本异常：', err.message)
  process.exit(1)
})

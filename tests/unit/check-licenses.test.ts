import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const exec = promisify(execFile)
const ROOT = process.cwd()
const SCRIPT = resolve(ROOT, 'scripts/check-licenses.mjs')

interface PkgMeta {
  name: string
  version?: string
  license?: string
  dependencies?: Record<string, string>
}

/** 在临时目录里搭一个最小工程，跑检查脚本，返回退出码与输出。 */
async function runInFixture(
  deps: Record<string, PkgMeta>,
  modelFiles: Record<string, string> = {},
) {
  const dir = await mkdtemp(join(tmpdir(), 'lic-'))
  try {
    await mkdir(join(dir, 'node_modules'), { recursive: true })
    await mkdir(join(dir, 'public', 'models'), { recursive: true })
    await mkdir(join(dir, 'scripts'), { recursive: true })

    for (const [name, meta] of Object.entries(deps) as [string, PkgMeta][]) {
      const p = join(dir, 'node_modules', name)
      await mkdir(p, { recursive: true })
      await writeFile(join(p, 'package.json'), JSON.stringify(meta))
    }
    for (const [name, content] of Object.entries(modelFiles)) {
      await writeFile(join(dir, 'public', 'models', name), content)
    }
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'fixture', dependencies: Object.fromEntries(Object.keys(deps).map((k) => [k, '*'])) }),
    )

    // 复制脚本并按 fixture 目录运行
    const scriptSrc = await readFile(SCRIPT, 'utf8')
    await writeFile(join(dir, 'scripts', 'check-licenses.mjs'), scriptSrc)

    try {
      const { stdout, stderr } = await exec('node', ['scripts/check-licenses.mjs'], { cwd: dir })
      return { code: 0, out: stdout + stderr }
    } catch (err) {
      const e = err as { code?: number; stdout?: string; stderr?: string }
      return { code: e.code ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('check-licenses 脚本', () => {
  it('允许 MIT / Apache-2.0 等白名单许可证', async () => {
    const r = await runInFixture({
      'pkg-mit': { name: 'pkg-mit', version: '1.0.0', license: 'MIT' },
      'pkg-apache': { name: 'pkg-apache', version: '1.0.0', license: 'Apache-2.0' },
    })
    expect(r.code).toBe(0)
    expect(r.out).toContain('许可证检查通过')
  })

  it('拒绝 CC-BY-NC（禁止商用）并以非零码退出', async () => {
    const r = await runInFixture({
      'bad-nc': { name: 'bad-nc', version: '1.0.0', license: 'CC-BY-NC-SA-4.0' },
    })
    expect(r.code).not.toBe(0)
    expect(r.out).toContain('NC 许可证禁止商业使用')
  })

  it('拒绝 GPL 传递依赖', async () => {
    const r = await runInFixture({
      'top-ok': { name: 'top-ok', version: '1.0.0', license: 'MIT', dependencies: { 'sub-gpl': '*' } },
      'sub-gpl': { name: 'sub-gpl', version: '1.0.0', license: 'GPL-3.0-only' },
    })
    expect(r.code).not.toBe(0)
    expect(r.out).toContain('GPL')
  })

  it('接受 OR 组合表达式（MIT OR Apache-2.0）', async () => {
    const r = await runInFixture({
      'dual-pkg': { name: 'dual-pkg', version: '1.0.0', license: '(MIT OR Apache-2.0)' },
    })
    expect(r.code).toBe(0)
  })

  it('模型文件缺少 LICENSE 时失败', async () => {
    const r = await runInFixture(
      { 'pkg-mit': { name: 'pkg-mit', version: '1.0.0', license: 'MIT' } },
      { 'model.onnx': 'x', 'README.md': '# m' },
    )
    expect(r.code).not.toBe(0)
    expect(r.out).toContain('缺少 LICENSE')
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
const headers = readFileSync(resolve(process.cwd(), 'public/_headers'), 'utf8')

function cspContent(): string {
  const m = html.match(/Content-Security-Policy"\s+content="([^"]+)"/)
  if (!m) throw new Error('index.html 缺少 CSP meta 标签')
  return m[1]
}

function directives(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...values] = d.split(/\s+/)
        return [name, values]
      }),
  )
}

describe('CSP（隐私承诺的浏览器层强制）', () => {
  it('connect-src 只允许同域与本地 blob/data，杜绝素材外传', () => {
    const d = directives(cspContent())
    expect(d['connect-src']).toBeDefined()
    // 不允许任何 http(s) 外部源
    for (const src of d['connect-src']) {
      expect(src).not.toMatch(/^https?:/)
      expect(src).not.toBe('*')
    }
    expect(d['connect-src']).toEqual(expect.arrayContaining(['\'self\'']))
  })

  it('script-src 含 wasm-unsafe-eval（运行 WASM 必需）但含 unsafe-eval', () => {
    const d = directives(cspContent())
    expect(d['script-src']).toContain('\'wasm-unsafe-eval\'')
    expect(d['script-src']).not.toContain('\'unsafe-eval\'')
  })

  it('关掉危险面：object-src none、禁止表单外发', () => {
    const d = directives(cspContent())
    expect(d['object-src']).toEqual(['\'none\''])
    expect(d['form-action']).toEqual(['\'none\''])
  })

  it('worker-src 允许 blob（ORT 多线程会用到）', () => {
    const d = directives(cspContent())
    expect(d['worker-src']).toEqual(expect.arrayContaining(['blob:']))
  })
})

describe('静态托管头（_headers）', () => {
  it('声明 COOP/COEP 以启用多线程推理', () => {
    expect(headers).toMatch(/Cross-Origin-Opener-Policy:\s*same-origin/)
    expect(headers).toMatch(/Cross-Origin-Embedder-Policy:\s*require-corp/)
  })

  it('模型与运行时使用长缓存', () => {
    const modelsSection = headers.slice(headers.indexOf('/models/*'), headers.indexOf('/models/*') + 120)
    const ortSection = headers.slice(headers.indexOf('/ort/*'), headers.indexOf('/ort/*') + 120)
    expect(modelsSection).toMatch(/immutable/)
    expect(ortSection).toMatch(/immutable/)
  })

  it('index.html 使用 no-cache 以保证更新生效', () => {
    const idx = headers.indexOf('/index.html')
    expect(headers.slice(idx, idx + 80)).toMatch(/no-cache/)
  })
})

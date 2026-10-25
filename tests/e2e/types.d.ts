// E2E 通过浏览器内动态 import 访问 /src 下的模块，TS 无法静态解析这些路径。
declare module '/src/*' {
  const mod: any
  export = mod
}

import { defineConfig, devices } from '@playwright/test'

/**
 * 离线测试专用配置：必须跑在生产构建上（Service Worker 仅在 PROD 注册）。
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /(offline|prod-smoke)\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 180_000,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 240_000,
  },
})

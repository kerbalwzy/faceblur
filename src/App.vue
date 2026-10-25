<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { setLocale, getLocale, type Locale } from './locales'
import { useTheme, type ThemeMode } from './composables/useTheme'
import Home from './pages/Home.vue'

const { t } = useI18n()
const { theme, setTheme } = useTheme()

const locale = computed({
  get: () => getLocale(),
  set: (v: Locale) => setLocale(v),
})

const themeOptions: ThemeMode[] = ['auto', 'light', 'dark']

const themeLabels: Record<ThemeMode, string> = {
  auto: 'app.themeAuto',
  light: 'app.themeLight',
  dark: 'app.themeDark',
}

function themeLabel(mode: ThemeMode): string {
  return t(themeLabels[mode])
}
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="logo" aria-hidden="true">◍</span>
        <div>
          <h1>{{ t('app.title') }}</h1>
          <p class="tagline">{{ t('app.tagline') }}</p>
        </div>
      </div>

      <div class="controls">
        <label class="sr-only" for="locale-select">{{ t('app.language') }}</label>
        <select id="locale-select" v-model="locale" class="select">
          <option value="zh-CN">简体中文</option>
          <option value="en">English</option>
        </select>

        <label class="sr-only" for="theme-select">{{ t('app.theme') }}</label>
        <select
          id="theme-select"
          class="select"
          :value="theme"
          @change="setTheme(($event.target as HTMLSelectElement).value as ThemeMode)"
        >
          <option v-for="opt in themeOptions" :key="opt" :value="opt">
            {{ themeLabel(opt) }}
          </option>
        </select>
      </div>
    </header>

    <main class="main">
      <p class="privacy-badge" role="note">
        <span aria-hidden="true">🔒</span>
        {{ t('app.privacyBadge') }}
      </p>
      <Home />
    </main>

    <footer class="footer">
      <span>{{ t('footer.notice') }}</span>
    </footer>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elevated);
  flex-wrap: wrap;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo {
  font-size: 24px;
  color: var(--accent);
  line-height: 1;
}

h1 {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0.2px;
}

.tagline {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.controls {
  display: flex;
  gap: 8px;
}

.select {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
}

.main {
  flex: 1;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.privacy-badge {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--radius);
  background: var(--bg-soft);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 13px;
}

.footer {
  padding: 16px 20px 24px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
  border-top: 1px solid var(--border);
}

@media (max-width: 480px) {
  .topbar {
    padding: 12px 14px;
  }
  .main {
    padding: 14px;
  }
}
</style>

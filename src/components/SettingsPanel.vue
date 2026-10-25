<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '@/stores/session'
import { usePrefsStore } from '@/stores/prefs'
import type { BlurStyle } from '@/pipeline/render/blur'

const { t } = useI18n()
const session = useSessionStore()
const prefs = usePrefsStore()

const styles: Array<{ value: BlurStyle; label: string }> = [
  { value: 'blur', label: 'settings.styleBlur' },
  { value: 'pixelate', label: 'settings.stylePixelate' },
  { value: 'solid', label: 'settings.styleSolid' },
]

function setStyle(style: BlurStyle): void {
  session.settings.style = style
  prefs.prefs.style = style
}
</script>

<template>
  <section class="panel" :aria-label="t('settings.title')">
    <h3>{{ t('settings.title') }}</h3>

    <!-- 样式 -->
    <div class="field">
      <span class="label">{{ t('settings.style') }}</span>
      <div class="segmented" role="group">
        <button
          v-for="s in styles"
          :key="s.value"
          type="button"
          class="seg"
          :class="{ active: session.settings.style === s.value }"
          :aria-pressed="session.settings.style === s.value"
          @click="setStyle(s.value)"
        >
          {{ t(s.label) }}
        </button>
      </div>
    </div>

    <!-- 强度 -->
    <div class="field">
      <label class="label" for="strength">{{ t('settings.strength') }}</label>
      <div class="slider-row">
        <span class="end">{{ t('settings.strengthLow') }}</span>
        <input
          id="strength"
          v-model.number="session.settings.strength"
          type="range"
          min="0"
          max="1"
          step="0.05"
        />
        <span class="end">{{ t('settings.strengthHigh') }}</span>
      </div>
    </div>

    <!-- 形状 -->
    <div class="field">
      <span class="label">{{ t('settings.shape') }}</span>
      <div class="segmented" role="group">
        <button
          type="button"
          class="seg"
          :class="{ active: session.settings.shape === 'rounded' }"
          :aria-pressed="session.settings.shape === 'rounded'"
          @click="session.settings.shape = 'rounded'"
        >
          {{ t('settings.shapeRounded') }}
        </button>
        <button
          type="button"
          class="seg"
          :class="{ active: session.settings.shape === 'ellipse' }"
          :aria-pressed="session.settings.shape === 'ellipse'"
          @click="session.settings.shape = 'ellipse'"
        >
          {{ t('settings.shapeEllipse') }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.panel {
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

h3 {
  margin: 0;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-size: 13px;
  color: var(--text-muted);
}

.segmented {
  display: flex;
  gap: 4px;
  padding: 3px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 9px;
}

.seg {
  flex: 1;
  padding: 7px 8px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
}

.seg.active {
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.slider-row input {
  flex: 1;
  accent-color: var(--accent);
}

.end {
  font-size: 11px;
  color: var(--text-muted);
  min-width: 20px;
}
</style>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '@/stores/session'

const { t } = useI18n()
const session = useSessionStore()

function scorePercent(score: number): number {
  return Math.round(score * 100)
}
</script>

<template>
  <section class="panel" :aria-label="t('faces.title', { count: session.faceCount })">
    <header class="head">
      <h3>{{ t('faces.title', { count: session.faceCount }) }}</h3>
      <div class="bulk">
        <button type="button" class="link" @click="session.setAllFaces(true)">
          {{ t('faces.toggleAll') }}
        </button>
        <span aria-hidden="true">·</span>
        <button type="button" class="link" @click="session.setAllFaces(false)">
          {{ t('faces.toggleNone') }}
        </button>
      </div>
    </header>

    <p class="summary">{{ t('faces.enabled', { count: session.enabledCount }) }}</p>

    <ul class="list">
      <li v-for="(face, i) in session.faces" :key="face.id" class="item">
        <label class="row">
          <input
            type="checkbox"
            :checked="face.enabled"
            :aria-label="`${t('faces.faceLabel', { index: i + 1 })} — ${t('faces.toggle')}`"
            @change="session.toggleFace(face.id)"
          />
          <span class="idx">{{ t('faces.faceLabel', { index: i + 1 }) }}</span>
          <span class="conf">{{ t('faces.confidence', { value: scorePercent(face.box.score) }) }}</span>
        </label>
      </li>
    </ul>
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
  gap: 8px;
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

h3 {
  margin: 0;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.bulk {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  color: var(--text-muted);
}

.link {
  border: none;
  background: none;
  padding: 0;
  color: var(--accent);
  font-size: 12px;
  text-decoration: underline;
}

.summary {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 220px;
  overflow-y: auto;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: 7px;
  cursor: pointer;
}

.row:hover {
  background: var(--bg-soft);
}

.row input {
  accent-color: var(--accent);
}

.idx {
  flex: 1;
  font-size: 13px;
}

.conf {
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
</style>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const emit = defineEmits<{ (e: 'select', file: File): void }>()

const input = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
let dragDepth = 0

function openPicker(): void {
  input.value?.click()
}

function onPick(ev: Event): void {
  const file = (ev.target as HTMLInputElement).files?.[0]
  if (file) emit('select', file)
  // 允许重复选择同一个文件
  ;(ev.target as HTMLInputElement).value = ''
}

function onDragEnter(e: DragEvent): void {
  e.preventDefault()
  dragDepth++
  dragging.value = true
}

function onDragOver(e: DragEvent): void {
  e.preventDefault()
}

function onDragLeave(e: DragEvent): void {
  e.preventDefault()
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragging.value = false
}

function onDrop(e: DragEvent): void {
  e.preventDefault()
  dragDepth = 0
  dragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) emit('select', file)
}
</script>

<template>
  <div
    class="dropzone"
    :class="{ dragging }"
    role="button"
    tabindex="0"
    :aria-label="t('upload.title')"
    @click="openPicker"
    @keydown.enter.prevent="openPicker"
    @keydown.space.prevent="openPicker"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <input
      ref="input"
      class="hidden-input"
      type="file"
      accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
      @change="onPick"
    />
    <div class="icon" aria-hidden="true">＋</div>
    <h2>{{ dragging ? t('upload.dropHere') : t('upload.title') }}</h2>
    <p class="hint">{{ t('upload.hint') }}</p>
    <p class="formats">{{ t('upload.formats') }}</p>
    <button class="primary" type="button" @click.stop="openPicker">
      {{ t('upload.button') }}
    </button>
  </div>
</template>

<style scoped>
.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 320px;
  padding: 32px 20px;
  border: 2px dashed var(--border);
  border-radius: var(--radius);
  background: var(--bg-soft);
  text-align: center;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.dropzone:hover,
.dropzone.dragging {
  border-color: var(--accent);
  background: var(--bg-elevated);
}

.hidden-input {
  display: none;
}

.icon {
  font-size: 40px;
  color: var(--accent);
  line-height: 1;
}

h2 {
  margin: 0;
  font-size: 17px;
}

.hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}

.formats {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
}

.primary {
  margin-top: 10px;
  padding: 9px 20px;
  border: none;
  border-radius: 9px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}
</style>

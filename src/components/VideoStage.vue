<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '@/stores/session'
import { formatDuration } from '@/pipeline/import-video'

const { t } = useI18n()
const session = useSessionStore()

const emit = defineEmits<{
  (e: 'process'): void
  (e: 'cancel'): void
  (e: 'download'): void
  (e: 'replace', file: File): void
}>()

const info = computed(() => session.video)
const isProcessing = computed(() => session.stage === 'processing')
const hasResult = computed(() => session.resultBlob !== null)

function onPick(e: Event): void {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) emit('replace', f)
  ;(e.target as HTMLInputElement).value = ''
}
</script>

<template>
  <div v-if="info" class="wrap">
    <div class="meta">
      <span class="chip">{{ t('video.duration') }}: {{ formatDuration(info.duration) }}</span>
      <span class="chip">{{ t('video.resolution') }}: {{ info.width }}×{{ info.height }}</span>
      <span class="chip">{{ t('video.frames', { count: info.estimatedFrames }) }}</span>
    </div>

    <div class="player">
      <video
        ref="el"
        :src="info.url"
        controls
        playsinline
        class="video"
        :aria-label="info.name"
      />
    </div>

    <div v-if="session.degraded" class="notice" role="status">
      {{ t('video.degraded') }}
    </div>

    <div v-if="isProcessing" class="progress" role="status" aria-live="polite">
      <div class="row">
        <span>{{ t('video.processing') }}</span>
        <span class="num">
          {{ session.videoFrames.done }} / {{ session.videoFrames.total }}
          ({{ Math.round(session.videoProgress * 100) }}%)
        </span>
      </div>
      <div class="bar"><i :style="{ width: `${Math.round(session.videoProgress * 100)}%` }" /></div>
    </div>

    <div class="actions">
      <button
        v-if="!isProcessing"
        type="button"
        class="primary"
        @click="emit('process')"
      >
        {{ hasResult ? t('video.reexport') : t('video.process') }}
      </button>
      <button v-else type="button" class="danger" @click="emit('cancel')">
        {{ t('video.cancel') }}
      </button>

      <button v-if="hasResult && !isProcessing" type="button" class="primary" @click="emit('download')">
        {{ t('video.export') }}
      </button>

      <label class="file-btn">
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          class="sr-only"
          @change="onPick"
        />
        <span class="ghost">{{ t('upload.replacing') }}</span>
      </label>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-muted);
}

.player {
  display: flex;
  justify-content: center;
  padding: 12px;
  border-radius: var(--radius);
  background: var(--bg-soft);
  border: 1px solid var(--border);
}

.video {
  max-width: 100%;
  max-height: 60vh;
  border-radius: 8px;
  display: block;
}

.progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.num {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.bar {
  height: 8px;
  border-radius: 999px;
  background: var(--bg-soft);
  overflow: hidden;
  border: 1px solid var(--border);
}

.bar i {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.2s;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.primary,
.ghost,
.danger {
  padding: 9px 16px;
  border-radius: 9px;
  font-weight: 600;
  font-size: 14px;
}

.primary {
  border: none;
  background: var(--accent);
  color: var(--accent-contrast);
}

.danger {
  border: none;
  background: var(--danger);
  color: #fff;
}

.ghost {
  display: inline-block;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text);
}

.file-btn {
  cursor: pointer;
}

.notice {
  padding: 10px 12px;
  border-radius: var(--radius);
  border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
  background: color-mix(in srgb, var(--accent) 7%, var(--bg));
  font-size: 12px;
  color: var(--text-muted);
}
</style>

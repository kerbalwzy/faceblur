<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '@/stores/session'
import { renderImage } from '@/pipeline/image-pipeline'

const { t } = useI18n()
const session = useSessionStore()

const canvas = ref<HTMLCanvasElement | null>(null)
/** 原图（用于重绘时作为底图与模糊来源） */
const source = shallowRef<ImageBitmap | null>(null)

let raf = 0
let timer: ReturnType<typeof setTimeout> | null = null

/** 预览画布尺寸：按素材尺寸等比缩到合理上限，避免超大图拖慢绘制。 */
const PREVIEW_MAX = 1600

function computePreviewSize(w: number, h: number): { width: number; height: number } {
  const scale = Math.min(1, PREVIEW_MAX / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

function redraw(): void {
  const el = canvas.value
  const img = session.image
  if (!el || !img) return

  const ctx = el.getContext('2d')
  if (!ctx) return

  if (session.showingOriginal || session.faces.length === 0) {
    ctx.clearRect(0, 0, el.width, el.height)
    ctx.drawImage(img.bitmap, 0, 0, el.width, el.height)
    return
  }

  // 预览坐标 = 素材坐标 × 缩放比
  const scale = el.width / img.width
  const scaled = session.faces.map((f) => ({
    ...f,
    box: {
      ...f.box,
      x: f.box.x * scale,
      y: f.box.y * scale,
      width: f.box.width * scale,
      height: f.box.height * scale,
      kps: f.box.kps.map(([x, y]) => [x * scale, y * scale] as [number, number]),
    },
  }))

  renderImage(
    { ctx, width: el.width, height: el.height },
    img.bitmap,
    scaled,
    session.settings,
  )
}

function scheduleRedraw(): void {
  // 80ms 防抖，合并滑块高频输入（design D9）
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    if (raf) cancelAnimationFrame(raf)
    raf = requestAnimationFrame(redraw)
  }, 80)
}

function syncCanvasSize(): void {
  const el = canvas.value
  const img = session.image
  if (!el || !img) return
  const size = computePreviewSize(img.width, img.height)
  if (el.width !== size.width || el.height !== size.height) {
    el.width = size.width
    el.height = size.height
  }
}

watch(
  () => session.image,
  async (img) => {
    source.value = img?.bitmap ?? null
    // 等 DOM 更新完成后再取 canvas ref：导入瞬间组件可能刚挂载，
    // 直接读 canvas.value 会拿到 null 或默认 300×150 的画布。
    await nextTick()
    syncCanvasSize()
    redraw()
  },
  { immediate: true },
)

// 检测结果、参数、逐脸开关变化 → 只重绘，不重新检测
watch(
  () => [session.faces.map((f) => f.enabled), session.settings, session.showingOriginal],
  async () => {
    await nextTick()
    syncCanvasSize()
    scheduleRedraw()
  },
  { deep: true },
)

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="stage" :class="{ busy: session.busy }">
    <canvas ref="canvas" class="canvas" :aria-label="t('faces.title', { count: session.faceCount })" />

    <div v-if="session.stage === 'detecting'" class="overlay">
      <div class="spinner" aria-hidden="true" />
      <span>{{ t('stage.detecting') }}</span>
    </div>

    <div v-else-if="session.stage === 'ready' && session.faceCount === 0" class="overlay subtle">
      <strong>{{ t('stage.noFace') }}</strong>
      <small>{{ t('stage.noFaceHint') }}</small>
    </div>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  padding: 12px;
  border-radius: var(--radius);
  background: var(--bg-soft);
  border: 1px solid var(--border);
  overflow: hidden;
}

.canvas {
  max-width: 100%;
  max-height: 68vh;
  height: auto;
  border-radius: 8px;
  display: block;
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: color-mix(in srgb, var(--bg) 78%, transparent);
  font-size: 14px;
}

.overlay.subtle {
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  color: var(--text-muted);
}

.overlay.subtle strong {
  color: var(--text);
  font-size: 15px;
}

.overlay.subtle small {
  max-width: 320px;
  text-align: center;
}

.spinner {
  width: 22px;
  height: 22px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 2.4s;
  }
}
</style>

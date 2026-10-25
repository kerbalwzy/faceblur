<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '@/stores/session'
import { usePrefsStore } from '@/stores/prefs'
import { FaceDetector } from '@/engine/face-detector'
import { assessSupport, RECOMMENDED_BROWSERS } from '@/engine/support'
import { importImage, ImageImportError, extractImageFromClipboard } from '@/pipeline/import-image'
import { importVideo, VideoImportError, isSupportedVideo } from '@/pipeline/import-video'
import {
  downloadBlob,
  exportFileName,
  exportImage,
  type ExportFormat,
} from '@/pipeline/image-pipeline'
import { firstPassDetSize, minScoreFor } from '@/engine/strategy'
import {
  canUseWebCodecs,
  ensureVideoReady,
  processVideo,
  processVideoRealtime,
  VideoCancelled,
} from '@/pipeline/video-pipeline'
import Uploader from '@/components/Uploader.vue'
import ImageStage from '@/components/ImageStage.vue'
import VideoStage from '@/components/VideoStage.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import FaceList from '@/components/FaceList.vue'

const { t } = useI18n()
const session = useSessionStore()
const prefs = usePrefsStore()

const detector = shallowRef<FaceDetector | null>(null)
const support = computed(() => assessSupport())
const unsupported = computed(() => support.value.level === 'unsupported')
const singleThread = computed(() => support.value.reasons.includes('single-thread'))

const pendingLarge = ref<File | null>(null)
const exporting = ref(false)
const abortController = shallowRef<AbortController | null>(null)

async function ensureDetector(onProgress?: (ratio: number, stage: string) => void) {
  if (!detector.value) {
    const d = new FaceDetector()
    await d.init((p) => onProgress?.(p.ratio, p.stage))
    detector.value = d
  }
  return detector.value
}

/** 统一入口：按文件类型分流到图片或视频。 */
async function handleFile(file: File) {
  if (unsupported.value) return
  session.error = null

  if (isSupportedVideo(file)) {
    await handleVideo(file)
    return
  }
  await handleImage(file)
}

async function handleImage(file: File) {
  let loaded
  try {
    loaded = await importImage(file)
  } catch (err) {
    if (err instanceof ImageImportError && err.kind === 'too-large') {
      pendingLarge.value = file
      return
    }
    session.fail(err, false)
    return
  }
  await runDetection(loaded)
}

/**
 * 对已导入的图片执行检测。
 *
 * 关键：检测时传给 Worker 的是 bitmap 的副本。
 * ImageBitmap 作为 transferable 交给 Worker 后会 detached，
 * 主线程再用它绘制预览会得到全黑画布。
 */
async function runDetection(loaded: Awaited<ReturnType<typeof importImage>>) {
  session.setImage(loaded)
  try {
    if (!detector.value) {
      session.stage = 'loading'
      session.loadProgress = 0
      await ensureDetector((ratio, stage) => {
        session.loadProgress = ratio
        session.loadStage = stage as typeof session.loadStage
      })
    }
    session.stage = 'detecting'

    const strategy = { kind: 'image' as const, quality: prefs.prefs.qualityTier }
    const detSize = firstPassDetSize(strategy)
    // 高精度档同时放宽阈值，保证检出「只多不少」（见 strategy.minScoreFor）
    const minScore = minScoreFor(strategy)
    const copy = await createImageBitmap(loaded.bitmap)
    const faces = await detector.value!.detect(copy, { detSize, minScore, refineSmallFaces: true })
    session.setFaces(faces)
    session.stage = 'ready'
  } catch (err) {
    session.fail(err)
  }
}

async function handleVideo(file: File) {
  try {
    const info = await importVideo(file)
    session.setVideo(info)
    session.degraded = !canUseWebCodecs()
    // 先取一张封面帧做检测，让用户进页面就能看到预览
    await previewVideoFaces(info)
  } catch (err) {
    if (err instanceof VideoImportError) session.fail(err, false)
    else session.fail(err)
  }
}

/** 用当前时间点的一帧做快速预览检测（不改变视频播放位置）。 */
async function previewVideoFaces(info: NonNullable<typeof session.video>) {
  const video = info.element
  try {
    // 等视频解码出首帧再取预览，否则画布是空白
    await ensureVideoReady(video)
    if (!detector.value) {
      session.stage = 'loading'
      session.loadProgress = 0
      await ensureDetector((ratio, stage) => {
        session.loadProgress = ratio
        session.loadStage = stage as typeof session.loadStage
      })
    }
    session.stage = 'detecting'

    const canvas = document.createElement('canvas')
    canvas.width = info.width
    canvas.height = info.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0, info.width, info.height)

    const bitmap = await createImageBitmap(canvas)
    const faces = await detector.value!.detect(bitmap, {
      detSize: 320,
      refineSmallFaces: false,
    })
    session.setFaces(faces)
    session.stage = 'ready'
  } catch {
    // 预览失败不影响后续处理
    session.stage = 'ready'
  }
}

async function processVideoNow() {
  const info = session.video
  if (!info) return
  // 只阻止「正在处理视频」时的重复点击；
  // 预览检测（detecting）不应阻塞正式处理——否则用户点了没反应。
  if (session.stage === 'processing') return

  // 视频元素刚加入 DOM 时可能还没解码出任何帧，
  // 此时直接 seek 会让处理卡死。必须先等就绪。
  try {
    await ensureVideoReady(info.element)
  } catch (err) {
    session.fail(err, false)
    return
  }

  const ctrl = new AbortController()
  abortController.value = ctrl
  session.stage = 'processing'
  session.videoProgress = 0
  session.videoFrames = { done: 0, total: info.estimatedFrames }

  try {
    const d = await ensureDetector()
    const settings = {
      style: session.settings.style,
      strength: session.settings.strength,
      shape: session.settings.shape,
      minScore: undefined,
    }

    const run = canUseWebCodecs() ? processVideo : processVideoRealtime
    const result = await run(d, info.element, settings, {
      signal: ctrl.signal,
      onProgress: (p) => {
        session.videoProgress = p.ratio
        session.videoFrames = { done: p.frame, total: p.total }
      },
    })

    session.resultBlob = result.blob
    session.resultName = exportFileName(
      info.name,
      result.ext === 'mp4' ? 'image/jpeg' : 'image/webp',
    ).replace(/-blurred\.\w+$/, `-blurred.${result.ext}`)
    session.degraded = result.degraded
    session.stage = 'ready'
  } catch (err) {
    if (err instanceof VideoCancelled) {
      session.stage = 'ready'
      session.videoProgress = 0
    } else {
      session.fail(err)
    }
  } finally {
    abortController.value = null
  }
}

function cancelVideo() {
  abortController.value?.abort()
}

function downloadVideo() {
  if (session.resultBlob) downloadBlob(session.resultBlob, session.resultName)
}

async function onExport() {
  const img = session.image
  if (!img || exporting.value) return
  exporting.value = true
  session.stage = 'rendering'
  try {
    const blob = await exportImage(
      img.bitmap,
      img.width,
      img.height,
      session.faces,
      session.settings,
      prefs.prefs.format as ExportFormat,
      prefs.prefs.quality,
    )
    downloadBlob(blob, exportFileName(img.name, prefs.prefs.format as ExportFormat))
    session.stage = 'done'
    setTimeout(() => {
      if (session.stage === 'done') session.stage = 'ready'
    }, 1500)
  } catch (err) {
    session.fail(err)
  } finally {
    exporting.value = false
  }
}

async function confirmLarge() {
  const file = pendingLarge.value
  pendingLarge.value = null
  if (!file) return
  try {
    const loaded = await importImage(file, { allowLarge: true })
    await runDetection(loaded)
  } catch (err) {
    session.fail(err)
  }
}

function retry() {
  session.error = null
  session.reset()
}

function onPaste(e: ClipboardEvent) {
  const file = extractImageFromClipboard(e.clipboardData?.items ?? null)
  if (file) {
    e.preventDefault()
    void handleFile(file)
  }
}

onMounted(() => window.addEventListener('paste', onPaste))
onBeforeUnmount(() => {
  window.removeEventListener('paste', onPaste)
  abortController.value?.abort()
  void detector.value?.dispose()
})
</script>

<template>
  <div class="layout">
    <div v-if="unsupported" class="notice danger" role="alert">
      <strong>{{ t('error.unsupportedBrowser') }}</strong>
      <p>{{ t('error.unsupportedHint') }}</p>
      <small>{{ RECOMMENDED_BROWSERS }}</small>
    </div>

    <div v-else-if="singleThread" class="notice">{{ t('error.singleThread') }}</div>

    <Uploader v-if="!session.hasMedia && session.stage !== 'error'" @select="handleFile" />

    <div v-else-if="session.hasMedia" class="workbench">
      <div class="preview">
        <VideoStage
          v-if="session.hasVideo"
          @process="processVideoNow"
          @cancel="cancelVideo"
          @download="downloadVideo"
          @replace="handleFile"
        />
        <template v-else>
          <ImageStage />
          <div class="actions">
            <button
              type="button"
              class="ghost"
              @pointerdown="session.showingOriginal = true"
              @pointerup="session.showingOriginal = false"
              @pointerleave="session.showingOriginal = false"
              @keydown.space.prevent="session.showingOriginal = true"
              @keyup.space.prevent="session.showingOriginal = false"
            >
              {{ t('export.compare') }}
            </button>
            <button
              type="button"
              class="primary"
              :disabled="!session.canExport || exporting"
              @click="onExport"
            >
              {{ session.stage === 'rendering' ? t('stage.rendering') : t('export.button') }}
            </button>
            <label class="file-btn">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                class="sr-only"
                @change="(e) => handleFile((e.target as HTMLInputElement).files![0])"
              />
              <span class="ghost block">{{ t('upload.replacing') }}</span>
            </label>
          </div>
        </template>

        <div v-if="session.stage === 'loading'" class="progress" role="status">
          <span>{{ t('stage.loading') }}</span>
          <div class="bar">
            <i :style="{ width: `${Math.round(session.loadProgress * 100)}%` }" />
          </div>
        </div>
      </div>

      <aside class="side">
        <FaceList v-if="session.faceCount > 0" />
        <SettingsPanel />
      </aside>
    </div>

    <div v-else class="notice danger" role="alert">
      <strong>{{ t('error.title') }}</strong>
      <p>{{ session.error?.message }}</p>
      <div class="err-actions">
        <button v-if="session.error?.retryable" type="button" class="primary" @click="retry">
          {{ t('error.retry') }}
        </button>
        <button type="button" class="ghost" @click="session.reset()">
          {{ t('error.reselect') }}
        </button>
      </div>
    </div>

    <div v-if="pendingLarge" class="notice warn" role="dialog" aria-modal="true">
      <p>图片较大，处理可能需要一段时间。是否继续？</p>
      <div class="err-actions">
        <button type="button" class="primary" @click="confirmLarge">继续</button>
        <button type="button" class="ghost" @click="pendingLarge = null">取消</button>
      </div>
    </div>

    <p class="sr-only" aria-live="polite">
      <template v-if="session.stage === 'done'">{{ t('export.done') }}</template>
    </p>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.workbench {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 16px;
  align-items: start;
}

.preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: sticky;
  top: 16px;
}

.primary,
.ghost {
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

.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ghost {
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text);
}

.block {
  display: block;
}

.file-btn {
  display: inline-block;
  cursor: pointer;
}

.notice {
  padding: 12px 14px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-soft);
  font-size: 13px;
}

.notice.danger {
  border-color: color-mix(in srgb, var(--danger) 45%, var(--border));
  background: color-mix(in srgb, var(--danger) 8%, var(--bg));
}

.notice.warn {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--bg));
}

.notice p {
  margin: 6px 0 0;
  color: var(--text-muted);
}

.err-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}

.bar {
  height: 6px;
  border-radius: 999px;
  background: var(--bg-soft);
  overflow: hidden;
}

.bar i {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.2s;
}

@media (max-width: 900px) {
  .workbench {
    grid-template-columns: 1fr;
  }
  .side {
    position: static;
  }
}
</style>

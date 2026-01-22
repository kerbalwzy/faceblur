<template>
  <div style="position: relative; width: 100%; height: 100%">
    <!-- Video 放在最底层 -->
    <video
      ref="sourceVideo"
      :src="appStore.sourceVideo"
      muted
      style="width: 100%; height: 100%; opacity: 0.5"
    ></video>
    <div
      class="d-flex flex-column align-center justify-center pa-5"
      style="position: absolute; left: 0; top: 0; width: 100%; height: 100%"
    >
      <v-progress-circular
        :model-value="appStore.progress"
        :rotate="360"
        :size="200"
        :width="30"
        color="#38B000"
      >
        <template v-slot:default>
          <h1>{{ appStore.progress }} %</h1>
        </template>
      </v-progress-circular>
    </div>
  </div>
</template>
<script setup lang="ts">
import { useAppStore } from "@/stores";
import { ref, watch } from "vue";

const appStore = useAppStore();
// 视频元素引用
const sourceVideo = ref(null);
watch(
  () => appStore.progress,
  (newProgress) => {
    if (!sourceVideo.value) return;
    const video: any = sourceVideo.value;
    if (video.readyState >= 2) {
      video.currentTime = (newProgress / 100) * video.duration;
    }
  }
);
</script>
<style scoped></style>

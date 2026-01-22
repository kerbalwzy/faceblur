<template>
  <v-card color="#424242" class="d-flex flex-column">
    <div class="video-container">
      <div
        v-if="!appStore.outputVideo"
        class="d-flex flex-column align-center justify-center pa-5"
        style="width: 100%; height: 100%"
      >
        <v-progress-circular
          :model-value="appStore.processRate"
          :rotate="360"
          :size="200"
          :width="30"
          color="success"
        >
          <template v-slot:default> {{ appStore.processRate }} % </template>
        </v-progress-circular>
      </div>
      <video v-else :src="appStore.outputVideo" controls></video>
      <v-btn
        v-if="appStore.outputVideo"
        class="download-btn"
        icon="mdi-file-find"
        size="small"
        color="primary"
        variant="flat"
        @click="downloadVideo"
      >
      </v-btn>
    </div>
    <v-btn
      class="start-task-btn mt-2"
      block
      color="primary"
      @click="startTask"
      :disabled="appStore.processRate > 0"
    >
      {{ t("label.StartTask") }}
    </v-btn>
  </v-card>
</template>

<script setup lang="ts">
import { useAppStore } from "@/stores";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const appStore = useAppStore();

const startTask = () => {
  appStore.outputVideo = "";
  appStore.processRate = 1;
  pywebview.api
    .start_task(
      appStore.sourceVideo,
      appStore.ignoreFaces,
      appStore.faceRecConf
    )
    .then((result: string) => {
      console.log("start_task: finished", result);
      appStore.updateOutputVideo(result);
      appStore.updateProcessRate(0);
    });
};

const downloadVideo = () => {
  if (!appStore.outputVideo) {
    return;
  }
  pywebview.api.show_output_video(appStore.outputVideo);
};
</script>

<style scoped>
.video-container {
  position: relative;
  width: 100%;
  height: 100%;
  flex-grow: 1;
  min-height: 0;
}

.video-container video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.download-btn {
  position: absolute;
  top: 2px;
  left: 2px;
}
.start-task-btn {
  max-height: 48px;
}
</style>

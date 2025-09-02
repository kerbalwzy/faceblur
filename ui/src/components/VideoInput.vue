<template>
  <v-card color="#424242">
    <div
      v-if="!appStore.sourceVideo"
      class="d-flex flex-column align-center justify-center pa-5 cursor-pointer"
      @click="selectVideoFile"
    >
      <v-icon size="48" color="primary">mdi-video-plus</v-icon>
      <p class="text-caption">{{ t("label.ClickHere") }}</p>
      <p class="text-caption">{{ t("label.SelectSourceVideo") }}</p>
      <p class="text-caption">(MP4)</p>
    </div>
    <video
      v-else
      :src="appStore.sourceVideo"
      style="width: 100%; height: 100%"
      controls
    ></video>
    <v-btn
      v-if="appStore.sourceVideo"
      class="delete-btn"
      icon="mdi-delete"
      size="x-small"
      color="error"
      variant="flat"
      :disabled="appStore.processRate > 0"
      @click="resetVideoInputFile"
    >
    </v-btn>
  </v-card>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
const { t } = useI18n();

import SocketService from "@/services/socket";
import { useAppStore } from "@/stores";

const appStore = useAppStore();

SocketService.on("input_video_selected", (data) => {
  if (data.result && data.result.length > 0) {
    appStore.updateSourceVideo(data.result[0]);
  }
});

const selectVideoFile = () => {
  if (!appStore.sourceVideo) {
    SocketService.emit("select_input_video", null);
  }
};

const resetVideoInputFile = () => {
  appStore.updateSourceVideo("");
};
</script>

<style scoped>
.delete-btn {
  position: absolute;
  top: 2px;
  left: 2px;
}
</style>

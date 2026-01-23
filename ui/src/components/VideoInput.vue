<template>
  <v-card>
    <v-card-text style="background-color: #3b3b3c; height: calc(100% - 48px)">
      <div
        v-if="!appStore.sourceVideo"
        class="d-flex flex-column align-center justify-center pa-5 cursor-pointer"
        style="width: 100%; height: 100%; color: aliceblue"
        @click="appStore.openSourceVideo"
      >
        <v-icon size="96" color="#10357f" icon="fas fa-video"></v-icon>
        <h4>{{ t("label.ClickHere") }}</h4>
        <h4>{{ t("label.SelectSourceVideo") }}</h4>
        <h4>(*.mp4;*.avi;*.mov)</h4>
      </div>
      <video
        v-else
        ref="sourceVideo"
        :src="appStore.sourceVideo"
        style="width: 100%; height: 100%"
        controls
      ></video>
    </v-card-text>
    <v-card-actions v-if="appStore.sourceVideo">
      <v-btn
        prepend-icon="fas fa-video-slash"
        color="error"
        variant="tonal"
        @click="appStore.sourceVideo = ''"
      >
        {{ t("label.Reset") }}
      </v-btn>
      <v-spacer></v-spacer>
      <v-dialog max-width="300">
        <template v-slot:activator="{ props: activatorProps }">
          <v-btn
            v-bind="activatorProps"
            icon="fas fa-cog"
            density="comfortable"
            color="surface-variant"
            variant="tonal"
          ></v-btn>
        </template>
        <template v-slot:default><FaceRecConf /> </template>
      </v-dialog>
      <v-btn
        @click="appStore.nextStep"
        prepend-icon="fas fa-hand-point-right"
        color="primary"
        variant="tonal"
      >
        {{ t("label.Next") }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
const { t } = useI18n();

import { useAppStore } from "@/stores";
import FaceRecConf from "./FaceRecConf.vue";
import { ref, watch } from "vue";

const appStore = useAppStore();
const sourceVideo = ref<HTMLVideoElement>();

watch(
  () => appStore.currentStep,
  (newStep) => {
    if (!sourceVideo.value) return;
    if (newStep === 1) return;
    const video: any = sourceVideo.value;
    if (video.readyState >= 2) {
      video.pause();
    }
  },
);
</script>

<style scoped>
.delete-btn {
  position: absolute;
  top: 2px;
  left: 2px;
}
</style>

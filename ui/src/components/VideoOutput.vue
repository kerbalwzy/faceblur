<template>
  <v-card>
    <v-card-text style="background-color: #3b3b3c; height: calc(100% - 48px)">
      <video
        v-if="appStore.outputVideo"
        ref="blurredVideo"
        :src="appStore.outputVideo"
        style="width: 100%; height: 100%"
        controls
      ></video>
      <Progress v-else style="height: 100%"></Progress>
    </v-card-text>
    <v-card-actions>
      <v-btn
        prepend-icon="fas fa-hand-point-left"
        color="error"
        variant="tonal"
        @click="appStore.prevStep"
      >
        {{ t("label.Prev") }}
      </v-btn>
      <v-spacer></v-spacer>
      <v-btn
        v-if="appStore.outputVideo"
        prepend-icon="fas fa-redo"
        color="#38B000"
        variant="tonal"
        @click="appStore.newTask"
      >
        {{ t("label.NewTask") }}
      </v-btn>
      <v-btn
        v-if="appStore.outputVideo"
        prepend-icon="fas fa-file-video"
        color="primary"
        variant="tonal"
        @click="appStore.showBlurredVideo()"
      >
        {{ t("label.ShowVideoFile") }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { useAppStore } from "@/stores";
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const appStore = useAppStore();
const blurredVideo = ref<HTMLVideoElement>();

watch(
  () => appStore.currentStep,
  (newStep) => {
    if (!blurredVideo.value) return;
    if (newStep === 3) return;
    const video: any = blurredVideo.value;
    if (video.readyState >= 2) {
      video.pause();
    }
  }
);
</script>

<style scoped></style>

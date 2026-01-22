<template>
  <v-card>
    <v-card-subtitle class="mt-5">{{ t("label.FaceRecConf") }}</v-card-subtitle>
    <v-card-text>
      <v-number-input
        v-model="appStore.faceRecConf.detThresh"
        density="comfortable"
        controlVariant="split"
        :label="t('label.DetectThreshold')"
        :precision="2"
        :min="0.1"
        :max="1"
        :step="0.05"
      >
      </v-number-input>
      <v-number-input
        v-model="appStore.faceRecConf.trackThresh"
        density="comfortable"
        controlVariant="split"
        :label="t('label.TrackThreshold')"
        :precision="2"
        :min="0.1"
        :max="1"
        :step="0.05"
      ></v-number-input>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useAppStore } from "@/stores";

const { t } = useI18n();

const appStore = useAppStore();
</script>

<style scoped></style>

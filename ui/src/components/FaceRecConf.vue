<template>
  <v-card>
    <v-card-subtitle class="mt-5">{{ t("label.FaceRecConf") }}</v-card-subtitle>
    <v-card-text>
      <v-text-field
        v-model="appStore.faceRecConf.detThresh"
        :label="t('label.DetThresh')"
        type="number"
        min="0.1"
        max="1"
        step="0.1"
        :disabled="appStore.processRate > 0"
        @change="updateFaceRecConf"
      />
      <v-text-field
        v-model="appStore.faceRecConf.simThresh"
        :label="t('label.SimThresh')"
        type="number"
        min="0.1"
        max="1"
        step="0.1"
        :disabled="appStore.processRate > 0"
        @change="updateFaceRecConf"
      />
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useAppStore } from "@/stores";

const { t } = useI18n();

const appStore = useAppStore();

const updateFaceRecConf = () => {
  appStore.updatefaceRecConf({
    detThresh: Number(appStore.faceRecConf.detThresh),
    simThresh: Number(appStore.faceRecConf.simThresh),
  });
};
</script>

<style scoped></style>

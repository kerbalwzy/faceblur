<template>
  <v-card>
    <v-card-text style="background-color: #3b3b3c; height: calc(100% - 48px)">
      <div
        v-if="appStore.faceParseRes.faces.length > 0"
        class="d-flex flex-wrap justify-space-around align-center"
        style="height: 100%; overflow-y: auto"
      >
        <div
          v-for="face in appStore.faceParseRes.faces"
          :key="face.track_id"
          style="position: relative"
        >
          <v-avatar
            size="80"
            class="ma-2 cursor-pointer"
            :image="face.img"
            @click="face.selected = !face.selected"
          >
          </v-avatar>
          <v-icon
            v-if="face.selected"
            icon="fas fa-check-circle"
            color="#38B000"
            style="position: absolute; top: 0; left: 40px"
            @click="face.selected = !face.selected"
          ></v-icon>
        </div>
      </div>
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
        v-if="appStore.faceParseRes.faces.length > 0"
        prepend-icon="fas fa-hand-point-right"
        color="primary"
        variant="tonal"
        @click="appStore.nextStep"
      >
        {{ t("label.Next") }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useAppStore } from "@/stores";
import Progress from "@/components/Progress.vue";

const { t } = useI18n();
const appStore = useAppStore();
</script>

<style scoped></style>

<template>
  <v-card>
    <div class="d-flex align-center justify-start">
      <div
        style="width: 170px;min-width: 170px;"
        class="d-flex flex-column align-center justify-center pa-8 cursor-pointer elevation-20"
        @click="addIgnoreFace"
      >
        <v-icon size="48" color="primary">mdi-image-plus</v-icon>
        <p class="text-caption">{{ t("label.ClickHere") }}</p>
        <p class="text-caption">{{ t("label.AddIgnoreFace") }}</p>
        <p class="text-caption">(JPEG, JPG, PNG)</p>
      </div>
      <div
        ref="ignoreFacesContainer"
        class="d-flex flex-row align-center justify-start ignore-faces"
      >
        <div
          v-for="(face, index) in appStore.ignoreFaces"
          :key="index"
          class="ml-1 pa-1 position-relative d-flex align-center"
          style="background-color: #424242; height: 100%"
        >
          <v-img :src="face" aspect-ratio="1/1" style="width: 150px"></v-img>
          <v-btn
            class="delete-btn"
            icon="mdi-delete"
            size="x-small"
            color="error"
            variant="flat"
            @click="deleteIgnoreFace(index)"
          >
          </v-btn>
        </div>
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
const { t } = useI18n();

import SocketService from "@/services/socket";
import { useAppStore } from "@/stores";
import { onMounted, onUnmounted, ref } from "vue";

const appStore = useAppStore();
const ignoreFacesContainer = ref<HTMLElement | null>(null);

const handleWheel = (event: WheelEvent) => {
  if (ignoreFacesContainer.value) {
    event.preventDefault();
    ignoreFacesContainer.value.scrollLeft += event.deltaY * 1.2;
  }
};

onMounted(() => {
  if (ignoreFacesContainer.value) {
    ignoreFacesContainer.value.addEventListener("wheel", handleWheel, {
      passive: false,
    });
  }
});

onUnmounted(() => {
  if (ignoreFacesContainer.value) {
    ignoreFacesContainer.value.removeEventListener("wheel", handleWheel);
  }
});

SocketService.on("ignore_face_selected", (data) => {
  if (data.result && data.result.length > 0) {
    const res: never[] = data.result;
    res.forEach((f) => appStore.addIgnoreFace(f));
  }
});

const addIgnoreFace = () => {
  SocketService.emit("add_ignore_face", null);
};

const deleteIgnoreFace = (index: number) => {
  appStore.delIgnoreFace(index);
};
</script>

<style scoped>
.delete-btn {
  position: absolute;
  top: 2px; /* 调整位置，留出一些边距 */
  right: 2px; /* 调整位置，留出一些边距 */
  z-index: 10; /* 确保按钮在最上层 */
}

.ignore-faces {
  flex-grow: 1;
  height: 160px;
  overflow-x: auto;
  overflow-y: hidden;
}

/* 为每个图片容器创建定位上下文 */
.position-relative {
  position: relative;
}
</style>

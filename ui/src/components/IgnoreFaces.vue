<template>
  <v-card>
    <div class="d-flex align-center justify-start">
      <div
        style="width: 180px; min-width: 180px"
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
        @wheel="handleWheel"
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
import { ref, onMounted, onUnmounted } from "vue";

const appStore = useAppStore();
const ignoreFacesContainer = ref<HTMLElement | null>(null);

const handleWheel = (event: WheelEvent) => {
  if (!ignoreFacesContainer.value) return;
  event.preventDefault();
  const scrollDelta = (event.deltaX || event.deltaY) * 1.5;
  ignoreFacesContainer.value.scrollLeft += scrollDelta;
};

const touchData = ref({
  startX: 0,
  scrollLeft: 0,
  isScrolling: false,
});

const handleTouchStart = (event: TouchEvent) => {
  if (!ignoreFacesContainer.value) return;

  const touch = event.touches[0];
  touchData.value = {
    startX: touch.clientX,
    scrollLeft: ignoreFacesContainer.value.scrollLeft,
    isScrolling: true,
  };
};

const handleTouchMove = (event: TouchEvent) => {
  if (!ignoreFacesContainer.value || !touchData.value.isScrolling) return;

  const touch = event.touches[0];
  const deltaX = touchData.value.startX - touch.clientX;
  ignoreFacesContainer.value.scrollLeft = touchData.value.scrollLeft + deltaX;

  event.preventDefault();
};

const handleTouchEnd = () => {
  touchData.value.isScrolling = false;
};

onMounted(() => {
  const container = ignoreFacesContainer.value;
  if (!container) return;

  container.addEventListener("touchstart", handleTouchStart, { passive: true });
  container.addEventListener("touchmove", handleTouchMove, { passive: false });
  container.addEventListener("touchend", handleTouchEnd);
});

onUnmounted(() => {
  const container = ignoreFacesContainer.value;
  if (!container) return;

  container.removeEventListener("touchstart", handleTouchStart);
  container.removeEventListener("touchmove", handleTouchMove);
  container.removeEventListener("touchend", handleTouchEnd);
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
  top: 2px;
  left: 2px;
  z-index: 10;
}

.ignore-faces {
  flex-grow: 1;
  height: 160px;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}

.position-relative {
  position: relative;
}
</style>

<template>
  <v-card>
    <v-card-text style="background-color: #3b3b3c; height: calc(100% - 48px)">
      <div
        v-if="appStore.faceParseRes.faces.length > 0"
        class="d-flex flex-wrap"
        style="height: 100%"
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
import { ref, onMounted, onUnmounted } from "vue";
import Progress from "@/components/Progress.vue";

const { t } = useI18n();
const appStore = useAppStore();
const ignoreFacesContainer = ref<HTMLElement | null>(null);

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

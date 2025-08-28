<template>
  <v-card>
    <div class="d-flex align-center justify-start">
      <div
        style="max-width: fit-content"
        class="d-flex flex-column align-center justify-center pa-8 cursor-pointer"
        @click="addIgnoreFace"
      >
        <v-icon size="48" color="primary">mdi-image-plus</v-icon>
        <p class="text-caption">{{ $t("label.ClickToAddIgnoreFace") }}</p>
        <p class="text-caption">jpeg, jpg, png</p>
      </div>
      <v-divider :thickness="3" color="warning" vertical></v-divider>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { ref } from "vue";
import SocketService from "@/services/socket";

const videoInputFile = ref();

SocketService.on("input_video_selected", (data) => {
  if (data.result && data.result.length > 0) {
    videoInputFile.value = data.result[0];
  }
});

const addIgnoreFace = () => {
  if (!videoInputFile.value) {
    SocketService.emit("add_ignore_face", null);
  }
};

const resetVideoInputFile = () => {
  videoInputFile.value = null;
};
</script>

<style scoped>
.delete-btn {
  position: absolute;
  top: 2px;
  right: 2px;
}
</style>

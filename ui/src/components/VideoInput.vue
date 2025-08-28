<template>
  <v-card color="#424242">
    <v-card-text>
      <div
        v-if="!videoInputFile"
        class="d-flex flex-column align-center justify-center pa-5 cursor-pointer"
        @click="selectVideoFile"
      >
        <v-icon size="48" color="primary">mdi-video-plus</v-icon>
        <p class="text-caption">{{ $t("label.ClickToSelectInputVideo") }}</p>
        <p class="text-caption">(MP4)</p>
      </div>
      <video
        v-else
        :src="videoInputFile"
        style="width: 100%; height: 100%"
        controls
      ></video>
      <v-btn
        v-if="videoInputFile"
        class="delete-btn"
        icon="mdi-delete"
        size="x-small"
        color="error"
        variant="flat"
        @click="resetVideoInputFile"
      >
      </v-btn>
    </v-card-text>
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

const selectVideoFile = () => {
  if (!videoInputFile.value) {
    SocketService.emit("select_input_video", null);
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

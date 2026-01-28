<template>
  <v-container fluid>
    <div v-if="modelLoaded">
      <v-stepper
        :items="['', '', '']"
        hide-actions
        v-model="appStore.currentStep"
      >
        <template v-slot:item.1>
          <VideoInput style="height: 410px" />
        </template>
        <template v-slot:item.2>
          <VideoFaces style="height: 410px" />
        </template>
        <template v-slot:item.3>
          <VideoOutput style="height: 410px" />
        </template>
      </v-stepper>
      <Footer />
    </div>
    <div
      v-else
      class="d-flex flex-column align-center justify-center"
      style="height: 100%"
    >
      <v-progress-circular
        indeterminate
        color="primary"
        style="width: 100px; height: 100px"
      />
      <div>{{ t("label.AiModelLoading") }}</div>
    </div>
  </v-container>
</template>
<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ref } from "vue";
import { useAppStore } from "@/stores";
import VideoInput from "@/components/VideoInput.vue";
import VideoFaces from "@/components/VideoFaces.vue";
import VideoOutput from "@/components/VideoOutput.vue";
import Footer from "@/components/Footer.vue";

declare global {
  interface Window {
    appStore: any;
  }
}

const { t, locale } = useI18n();
const appStore = useAppStore();
const modelLoaded = ref(false);

window.addEventListener("pywebviewready", function () {
  window.appStore = appStore;

  pywebview.api.get_setting("lang").then((result: any) => {
    console.log("get_setting: lang = ", result);
    if (result) {
      locale.value = result;
    }
  });
  pywebview.api.init_face_recognizer().then(() => {
    modelLoaded.value = true;
  });
});
</script>

<style scoped>
.video-input {
  width: 240px;
  height: 160px;
  min-width: 240px;
}
.ignore-faces {
  flex-grow: 1;
  height: 160px;
}

.face-rec-conf {
  width: 240px;
  min-width: 240px;
}

.video-output {
  flex-grow: 1;
  height: 380px;
  max-height: 380px;
}
</style>

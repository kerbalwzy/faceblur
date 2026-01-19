<template>
  <v-container fluid>
    <div v-if="modelLoaded">
      <div class="d-flex align-stretch justify-space-between">
        <VideoInput class="video-input elevation-18" />
        <IgnoreFaces class="ignore-faces ml-2 elevation-18" />
        <LanguageBtn />
      </div>
      <div
        class="d-flex align-stretch justify-space-between mt-10"
        style="margin-right: 40px"
      >
        <FaceRecConf class="face-rec-conf elevation-18" />
        <VideoOutput class="video-output elevation-18 ml-2" />
      </div>
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
import LanguageBtn from "@/components/LanguageBtn.vue";
import VideoInput from "@/components/VideoInput.vue";
import IgnoreFaces from "@/components/IgnoreFaces.vue";
import FaceRecConf from "@/components/FaceRecConf.vue";
import VideoOutput from "@/components/VideoOutput.vue";

import { useI18n } from "vue-i18n";
import { ref } from "vue";
import { useAppStore } from "@/stores";

declare global {
  interface Window {
    updateProcessRate: (rate: number) => void;
    updateModelLoaded: (loaded: boolean) => void;
  }
}

const { t, locale } = useI18n();
const appStore = useAppStore();
const modelLoaded = ref(false);

window.addEventListener("pywebviewready", function () {
  // expose methods for backend app
  window.updateProcessRate = appStore.updateProcessRate;

  //
  console.log(pywebview.api);
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

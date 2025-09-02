<template>
  <v-container fluid>
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
  </v-container>
</template>
<script setup lang="ts">
import LanguageBtn from "@/components/LanguageBtn.vue";
import VideoInput from "@/components/VideoInput.vue";
import IgnoreFaces from "@/components/IgnoreFaces.vue";
import FaceRecConf from "@/components/FaceRecConf.vue";
import VideoOutput from "@/components/VideoOutput.vue";
import { onMounted } from "vue";
import SocketService from "@/services/socket";

import { useI18n } from "vue-i18n";

const { locale } = useI18n();

onMounted(() => {
  SocketService.emit("get_language", null);
  SocketService.on("lang", (data) => {
    if (data.result) {
      locale.value = data.result;
    }
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

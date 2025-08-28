<template>
  <v-container fluid>
    <div class="d-flex align-stretch justify-space-between">
      <VideoInput class="video-input elevation-18" />
      <IgnoreFaces class="ignore-faces ml-2 elevation-18" />
      <LanguageBtn />
    </div>
  </v-container>
</template>
<script setup lang="ts">
import LanguageBtn from "@/components/LanguageBtn.vue";
import VideoInput from "@/components/VideoInput.vue";
import IgnoreFaces from "@/components/IgnoreFaces.vue";

window.addEventListener("pywebviewready", function () {
  // expose methods for backend app
  console.log("pywebviewready");
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
</style>

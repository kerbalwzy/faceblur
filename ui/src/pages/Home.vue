<template>
  <v-container fluid>
    <div class="d-flex align-stretch justify-space-between">
      <VideoInput class="video-input" />
      <IgnoreFaces class="ignore-faces ml-2" />
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
}
.ignore-faces {
  flex-grow: 1;
  height: 160px;
  overflow-x: auto;
  overflow-y: hidden;
}

</style>

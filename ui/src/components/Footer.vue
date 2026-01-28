<template>
  <div class="mt-5 d-flex align-center justify-end">
    <v-btn
      class="mr-2"
      icon="fab fa-github"
      size="small"
      variant="tonal"
      @click="openLink('github')"
    ></v-btn>
    <LanguageBtn />
  </div>
</template>
<script lang="ts" setup>
import LanguageBtn from "@/components/LanguageBtn.vue";

const openLink = (link: string) => {
  let url = "";
  switch (link) {
    case "github":
      url = "https://github.com/kerbalwzy/faceblur";
      break;
    default:
      break;
  }
  if (url) {
    window.open(url, "_blank");
  }
};
</script>
<style scoped></style>

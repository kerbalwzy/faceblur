import { defineStore } from "pinia";

export const useAppStore = defineStore("app", {
  state: () => ({
    sourceVideo: "",
    ignoreFaces: [],
  }),
  actions: {
    updateSourceVideo(sourceVideo: string) {
      if (this.sourceVideo === sourceVideo) {
        return;
      }
      this.sourceVideo = sourceVideo;
    },
    addIgnoreFace(filepath: never) {
      if (this.ignoreFaces.includes(filepath)) {
        return;
      }
      this.ignoreFaces.push(filepath);
    },
    delIgnoreFace(index: number) {
      this.ignoreFaces = this.ignoreFaces.filter((f, i) => i !== index);
    },
  },
  persist: true,
});

import { defineStore } from "pinia";

export const useAppStore = defineStore("app", {
  state: () => ({
    sourceVideo: "",
    ignoreFaces: [],
  }),
  actions: {
    updateSourceVideo(sourceVideo: string) {
      this.sourceVideo = sourceVideo;
    },
    addIgnoreFace(filepath: never) {
      this.ignoreFaces.push(filepath);
    },
    delIgnoreFace(index: number) {
      this.ignoreFaces = this.ignoreFaces.filter((f, i) => i !== index);
    },
  },
  persist: true,
});

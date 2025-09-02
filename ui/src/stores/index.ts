import { defineStore } from "pinia";

export const useAppStore = defineStore("app", {
  state: () => ({
    sourceVideo: "",
    ignoreFaces: [],
    faceRecConf: {
      detThresh: 0.5,
      simThresh: 0.5,
    },
    processRate: 0,
    outputVideo: "",
  }),
  actions: {
    updateSourceVideo(sourceVideo: string) {
      this.outputVideo = "";
      this.processRate = 0;
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
    updatefaceRecConf(params: { detThresh: number; simThresh: number }) {
      this.faceRecConf = params;
    },
    updateProcessRate(rate: number) {
      this.processRate = rate;
    },
    updateOutputVideo(outputVideo: string) {
      this.outputVideo = outputVideo;
    },
  },
  persist: true,
});

import { defineStore } from "pinia";

export const useAppStore = defineStore("app", {
  state: () => ({
    currentStep: 1,
    sourceVideo: "",
    faceRecConf: {
      detThresh: 0.65,
      trackThresh: 0.65,
    },
    faceParseRes: {
      taskId: "",
      totalFaces: 0,
      faces: [] as TrackedFace[],
    },
    progress: 0,
    outputVideo: "",
  }),
  actions: {
    openSourceVideo() {
      this.progress = 0;
      this.outputVideo = "";
      pywebview.api.open_source_video().then((sourceVideo: string) => {
        this.sourceVideo = sourceVideo;
      });
    },
    resetVideoFaces() {
      this.faceParseRes.taskId = "";
      this.faceParseRes.totalFaces = 0;
      this.faceParseRes.faces = [];
    },
    parseVideoFaces() {
      this.progress = 0;
      this.resetVideoFaces();
      pywebview.api
        .parse_video_faces(
          this.sourceVideo,
          this.faceRecConf.detThresh,
          this.faceRecConf.trackThresh,
        )
        .then((res: any) => {
          this.faceParseRes.taskId = res.video_info.task_id;
          this.faceParseRes.totalFaces =
            res.processing_info.unique_faces_tracked;
          this.faceParseRes.faces = res.faces.map((face: TrackedFace) => ({
            ...face,
            selected: true,
          }));
        });
    },
    blurVideoFaces(face_track_ids: number[]) {
      this.progress = 0;
      this.outputVideo = "";
      pywebview.api
        .blur_video_faces(
          this.sourceVideo,
          this.faceParseRes.taskId,
          face_track_ids,
        )
        .then((outputVideo: string) => {
          this.outputVideo = outputVideo;
        });
    },
    showBlurredVideo() {
      console.log(this.outputVideo);
      if (!this.outputVideo) return;
      pywebview.api.show_blurred_video(this.outputVideo);
    },
    updateProgress(rate: number) {
      this.progress = rate;
    },
    nextStep() {
      this.currentStep++;
      switch (this.currentStep) {
        case 2:
          this.parseVideoFaces();
          break;
        case 3:
          this.blurVideoFaces(
            this.faceParseRes.faces
              .filter((face) => face.selected)
              .map((face) => face.track_id),
          );
          break;
      }
    },
    prevStep() {
      this.currentStep--;
      switch (this.currentStep) {
        case 1:
          pywebview.api.cancel_parse_video_faces();
          break;
        case 2:
          pywebview.api.cancel_blur_video_faces();
          break;
      }
    },
    newTask() {
      this.resetVideoFaces();
      this.sourceVideo = "";
      this.outputVideo = "";
      this.currentStep = 1;
    },
  },
  persist: true,
});

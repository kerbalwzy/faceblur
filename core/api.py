import logging
import platform
import subprocess
import threading
import time
import multiprocessing
from webview import FileDialog
from pathlib import Path

from core.face import FaceRecognizer
from core.video import VideoFaceParser, VideoFaceBlurTool

logger = logging.getLogger("faceblur")

APILock = multiprocessing.Lock()


class AppAPI:
    currentVideoParser: VideoFaceParser = None
    currentVideoBlurTool: VideoFaceBlurTool = None

    def init_face_recognizer(self):
        with APILock:
            if not FaceRecognizer.isinited:
                FaceRecognizer.init()
        return FaceRecognizer.isinited

    def get_setting(self, key: str):
        from core.settings import settings

        return settings.get(key)

    def set_setting(self, key: str, value):
        from core.settings import settings

        settings.set(key, value)
        if key == "lang":
            from core.i18n import t
            from core.appui import appui

            t.set_locale(value)
            appui.update_systray_language()
        logger.info(f"set setting {key} to {value}")

    def open_source_video(self):
        from core.appui import appui

        file_types = ("Video File (*.mp4;*.avi;*.mov)",)
        result = appui.window.create_file_dialog(
            FileDialog.OPEN, allow_multiple=False, file_types=file_types
        )
        return result and list(result)[0]

    def parse_video_faces(
        self, video_path: str, det_thresh: float, track_thresh: float
    ):
        from core.appui import appui

        #
        if not FaceRecognizer.isinited:
            FaceRecognizer.init()
        if FaceRecognizer.det_thresh != det_thresh:
            FaceRecognizer.prepare(det_thresh=det_thresh)
        #
        parser = VideoFaceParser(
            video_path=video_path,
            track_thresh=track_thresh,
        )
        self.currentVideoParser = parser
        t = threading.Thread(target=parser.parse, daemon=True)
        t.start()

        while t.is_alive():
            if parser.progress > 0:
                appui.window.evaluate_js(
                    f"window.appStore.updateProgress({int(parser.progress * 100)})"
                )
            time.sleep(0.1)
        return parser._generate_result

    def cancel_parse_video_faces(self):
        if self.currentVideoParser:
            self.currentVideoParser.cancel()
            self.currentVideoParser = None

    def blur_video_faces(
        self, video_path: str, task_id: str, blur_track_ids: list[int]
    ):
        from core.appui import appui

        #
        blur_tool = VideoFaceBlurTool(
            video_path=video_path,
            task_id=task_id,
            blur_track_ids=blur_track_ids,
        )
        self.currentVideoBlurTool = blur_tool
        t = threading.Thread(target=blur_tool.blur, daemon=True)
        t.start()

        while t.is_alive():
            if blur_tool.progress > 0:
                appui.window.evaluate_js(
                    f"window.appStore.updateProgress({int(blur_tool.progress * 100)})"
                )
            time.sleep(0.1)
        return blur_tool.output_path

    def cancel_blur_video_faces(self):
        if self.currentVideoBlurTool:
            self.currentVideoBlurTool.cancel()
            self.currentVideoBlurTool = None

    def show_blurred_video(self, video_path: str):
        path = Path(video_path)
        if not path.exists():
            return
        system = platform.system()
        try:
            if system == "Windows":
                subprocess.run(["explorer", "/select,", str(path)])
            elif system == "Darwin":
                subprocess.run(["open", "-R", str(path)])
            else:
                raise NotImplementedError(
                    f"Open output video on {system} is not supported"
                )
        except Exception as e:
            logger.error(f"Open output video failed: {e}")

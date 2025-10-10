import logging
import platform
import subprocess
import threading
import time
from webview import FileDialog
from pathlib import Path

from core.blurer import VideoBlurer
from core.recognizer import FaceRecognizer, face_recognizer

logger = logging.getLogger("faceblur")


class AppAPI:

    def load_ai_models(self):

        global face_recognizer
        if face_recognizer is None:
            face_recognizer = FaceRecognizer()

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

    def set_source_video(self):
        from core.appui import appui

        file_types = ("Video File (*.mp4;*.avi;*.mov)",)
        result = appui.window.create_file_dialog(
            FileDialog.OPEN, allow_multiple=False, file_types=file_types
        )
        return result and list(result)[0]

    def set_ignore_faces(self):
        from core.appui import appui

        file_types = ("Image File (*.jpg;*.jpeg;*.png)",)
        result = appui.window.create_file_dialog(
            FileDialog.OPEN, allow_multiple=True, file_types=file_types
        )
        if result:
            logger.info(f"set ignore faces {result}")
        return result and list(result)

    def start_task(
        self, source_video: str, ignore_faces: list[str], face_rec_conf: dict
    ):
        from core.appui import appui

        global face_recognizer
        if face_recognizer is None:
            face_recognizer = FaceRecognizer()
        #
        face_recognizer.prepare(
            det_thresh=face_rec_conf["detThresh"],
            sim_thresh=face_rec_conf["simThresh"],
        )
        face_recognizer.set_faceignore(ignore_faces)
        blurer = VideoBlurer(face_recognizer, source_video)
        t = threading.Thread(target=blurer.process, daemon=True)
        t.start()
        while t.is_alive():
            if blurer.progress > 1:
                appui.window.evaluate_js(f"window.updateProcessRate({blurer.progress})")
            time.sleep(0.5)

        return blurer.output_file

    def show_output_video(self, output_video: str):
        path = Path(output_video)
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

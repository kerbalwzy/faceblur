import logging
import platform
import subprocess
import threading
import time
from pathlib import Path
from webview import FileDialog
from flask import Flask
from flask_socketio import SocketIO

from .settings import settings
from .i18n import t
from .appui import appui
from .recognizer import FaceRecognizer
from .blurer import VideoBlurer


__all__ = ["app", "socketio"]


logger = logging.getLogger("faceblur")
app = Flask(__name__)
socketio = SocketIO(app, async_mode="threading", cors_allowed_origins="file://")

global face_recognizer
face_recognizer = None


@socketio.on("show_window")
def handle_show_window(*args):
    appui.show_window()
    socketio.emit("window_showed")


@socketio.on("get_language")
def handle_get_language(*args):
    socketio.emit("lang", {"result": settings.get("lang")})


@socketio.on("set_language")
def handle_set_language(language):
    settings.set("lang", language)
    t.set_locale(language)
    appui.update_systray_language()


@socketio.on("select_input_video")
def handle_select_input_video(*args):
    file_types = ("Video File (*.mp4;*.avi;*.mov)",)
    result = appui.window.create_file_dialog(
        FileDialog.OPEN, allow_multiple=False, file_types=file_types
    )
    logger.debug(f"select_input_video: {result}")
    # Send result to ui
    socketio.emit("input_video_selected", {"result": result and list(result)})


@socketio.on("add_ignore_face")
def handle_add_ignore_face(*args):
    file_types = ("Image File (*.jpg;*.jpeg;*.png)",)
    result = appui.window.create_file_dialog(
        FileDialog.OPEN, allow_multiple=True, file_types=file_types
    )
    logger.debug(f"add_ignore_face: {result}")
    # Send result to ui
    socketio.emit("ignore_face_selected", {"result": result and list(result)})


@socketio.on("start_task")
def handle_start_task(params: dict):
    input_video = params["sourceVideo"]
    ignore_faces = params["ignoreFaces"]
    face_rec_conf = params["faceRecConf"]
    global face_recognizer
    if face_recognizer is None:
        face_recognizer = FaceRecognizer()
    #
    face_recognizer.prepare(
        det_thresh=face_rec_conf["detThresh"],
        sim_thresh=face_rec_conf["simThresh"],
    )
    face_recognizer.set_faceignore(ignore_faces)
    blurer = VideoBlurer(face_recognizer, input_video)
    t = threading.Thread(target=blurer.process, daemon=True)
    t.start()
    while t.is_alive():
        socketio.emit("process_rate_update", {"result": blurer.progress})
        time.sleep(0.1)

    socketio.emit("output_video_ready", {"result": blurer.output_file})


@socketio.on("open_output_video")
def handle_open_output_video(output_video: str):
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
            raise NotImplementedError(f"Open output video on {system} is not supported")
    except Exception as e:
        logger.error(f"Open output video failed: {e}")

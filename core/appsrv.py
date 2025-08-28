import logging
import eventlet
import threading
from webview import FileDialog
from flask import Flask, send_from_directory, current_app
from flask_socketio import SocketIO

from .consts import ICON_PATH, STATIC_DIR, STATIC_INDEX
from .appui import appui
from .recognizer import FaceRecognizer
from .blurer import VideoBlurer


__all__ = ["app", "socketio"]


logger = logging.getLogger("faceblur")
app = Flask(__name__, static_folder=STATIC_DIR)
socketio = SocketIO(app, async_mode="eventlet", cors_allowed_origins="file://")

app.face_recognizer = None


def prepare_face_recognizer(app: Flask):
    if app.face_recognizer is None:
        with app.app_context():
            app.face_recognizer = FaceRecognizer()


@app.route("/static/<path:path>")
def serve_static(path):
    return send_from_directory(STATIC_DIR, path)


@socketio.on("select_input_video")
def handle_select_input_video(*args):
    file_types = ("Video File (*.mp4;*.avi;*.mov)",)
    result = appui.window.create_file_dialog(
        FileDialog.OPEN, allow_multiple=False, file_types=file_types
    )
    logger.debug(f"select_input_video: {result}")
    # Send result to ui
    socketio.emit("input_video_selected", {"result": result and list(result)})
    # Prepare face recognizer
    if current_app.face_recognizer is None:
        threading.Thread(
            target=prepare_face_recognizer, args=(app,), daemon=True
        ).start()

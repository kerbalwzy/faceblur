import logging
import eventlet
from flask import Flask, send_from_directory
from flask_socketio import SocketIO

from .consts import STATIC_DIR

__all__ = ["app", "socketio"]


logger = logging.getLogger("faceblur")
app = Flask(__name__, static_folder=STATIC_DIR)
socketio = SocketIO(app, async_mode="eventlet")


@app.route("/static/<path:path>")
def serve_static(path):
    return send_from_directory(STATIC_DIR, path)


@socketio.on("message")
def handle_message(message):
    socketio.emit("response", f"服务器回应: {message}")

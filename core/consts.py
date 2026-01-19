import os


APP_NAME = "FaceBlur"
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETTING_PATH = os.path.join(PROJECT_DIR, "settings.json")
ICON_PATH = os.path.join(PROJECT_DIR, "favicon.ico")
#
STATIC_DIR = os.path.join(PROJECT_DIR, "static")
STATIC_INDEX = f"file://{STATIC_DIR}/index.html"
#
LOG_PATH = os.path.join(PROJECT_DIR, "log.txt")
# 临时目录
TEMP_DIR = os.path.join(PROJECT_DIR, "temp")
TEMP_FACES_RES_DIR = os.path.join(TEMP_DIR, "res")
TEMP_FACES_IMG_DIR = os.path.join(TEMP_DIR, "faces")


def init_dirs():
    """初始化临时目录"""
    os.makedirs(TEMP_FACES_RES_DIR, exist_ok=True)
    os.makedirs(TEMP_FACES_IMG_DIR, exist_ok=True)


init_dirs()

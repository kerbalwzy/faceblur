import os


PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETTING_PATH = os.path.join(PROJECT_DIR, "settings.json")
STATIC_DIR = os.path.join(PROJECT_DIR, "static")
ICON_PATH = os.path.join(STATIC_DIR, "favicon.ico")

STATIC_INDEX = "http://localhost:25823/static/index.html"



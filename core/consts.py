import os


PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETTING_PATH = os.path.join(PROJECT_DIR, "settings.json")
ICON_PATH = os.path.join(PROJECT_DIR, "favicon.ico")
#
STATIC_DIR = os.path.join(PROJECT_DIR, "static")
STATIC_INDEX = f"file://{STATIC_DIR}/index.html"

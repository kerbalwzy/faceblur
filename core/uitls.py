import os
import shutil


from PIL import Image
from pathlib import Path

from . import consts


def systray_darwin_icon(icon: Image.Image) -> Image.Image:
    if icon.mode != "RGBA":
        icon = icon.convert("RGBA")
    icon = icon.copy().resize((64, 64))
    icon = icon.convert("L")
    icon = icon.convert("RGBA")
    return icon


def clean_temp_files():
    temp_dir = Path(consts.TEMP_FACES_IMG_DIR)
    if temp_dir.exists():
        shutil.rmtree(temp_dir)
        os.makedirs(temp_dir, exist_ok=True)
    temp_dir = Path(consts.TEMP_FACES_RES_DIR)
    if temp_dir.exists():
        shutil.rmtree(temp_dir)
        os.makedirs(temp_dir, exist_ok=True)

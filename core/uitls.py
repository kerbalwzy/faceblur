from PIL import Image


def systray_darwin_icon(icon: Image.Image) -> Image.Image:
    if icon.mode != "RGBA":
        icon = icon.convert("RGBA")
    icon = icon.copy().resize((64, 64))
    icon = icon.convert("L")
    icon = icon.convert("RGBA")
    return icon

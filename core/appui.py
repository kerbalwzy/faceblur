import os
import logging
import pystray
import sys
import webview
from PIL import Image, ImageDraw

from core.uitls import systray_darwin_icon

from .consts import STATIC_INDEX, ICON_PATH
from .i18n import t

__all__ = ["appui"]


logger = logging.getLogger("faceblur")


def hide_replace_of_close(window: webview.Window):
    def func():
        if getattr(window, "systray_quite", False):
            return True
        if window.hidden is True:
            return True
        window.hidden = True
        window.hide()
        logger.debug(f"hide window {window.title} replace of close")
        return False

    return func


class AppUI:

    def __init__(
        self,
        title: str = "FaceBlur",
        icon: str = "",
        width: int = 1024,
        height: int = 666,
        url: str = "",
        js_api: object = None,
    ):
        self.__create_window(
            title=title,
            url=url,
            width=width,
            height=height,
            js_api=js_api,
        )
        self.__create_systray(title=title, icon=icon)
        logger.debug(f"appui inited")

    def __create_window(
        self, title: str, url: str, width: int, height: int, js_api: object
    ):
        # Center the window on the main screen
        main_screen = next(
            (screen for screen in webview.screens if bool(screen.x == screen.y == 0)),
            webview.screens[0],
        )
        x = (main_screen.width - width) // 2
        y = (main_screen.height - height) // 2
        self.window = webview.create_window(
            title=title,
            url=url,
            width=width,
            height=height,
            x=x,
            y=y,
            js_api=js_api,
            resizable=False,
        )
        self.window.events.closing += hide_replace_of_close(window=self.window)

    def __create_systray(self, title: str, icon: str = ""):
        if icon:
            iconImg = Image.open(icon)
        else:
            iconImg = Image.new("RGB", (128, 128), color=(73, 109, 137))  # 浅蓝色背景
            d = ImageDraw.Draw(iconImg)
            d.text((10, 10), "FB", fill=(255, 255, 0))

        if sys.platform == "darwin":
            iconImg = systray_darwin_icon(iconImg)
            #
            from AppKit import NSApplication

            ns_app = NSApplication.sharedApplication()
            systray = pystray.Icon(
                name=title, icon=iconImg, title=title, darwin_nsapplication=ns_app
            )
        else:
            systray = pystray.Icon(name=title, icon=iconImg, title=title)
        systray.menu = pystray.Menu(
            pystray.MenuItem(t("label.ShowWindow"), self.show_window),
            pystray.MenuItem(t("label.Quite"), self.quite),
        )
        self.systray = systray

    def show_window(self):
        self.window.hidden = False
        self.window.show()
        self.window.restore()

        logger.debug(f"show window {self.window.title}")

    def quite(self):
        try:
            setattr(self.window, "systray_quite", True)
            self.window.destroy()
            while len(webview.windows) > 0:
                window = webview.windows.pop()
                window.destroy()
            self.systray.stop()
        except Exception as e:
            logger.error(f"appui quite error: {e}")
        logger.debug(f"appui quite")
        try:
            os._exit(0)
        except:
            pass

    def update_systray_language(self):
        self.systray.menu = pystray.Menu(
            pystray.MenuItem(t("label.ShowWindow"), self.show_window),
            pystray.MenuItem(t("label.Quite"), self.quite),
        )
        logger.debug(f"update systray language")

    def run(self, func=None, debug: bool = False):
        self.systray.run_detached()
        logger.debug(f"appui run")
        webview.start(func=func, debug=debug)


appui = AppUI(url=STATIC_INDEX, icon=ICON_PATH)

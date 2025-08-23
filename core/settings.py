import json
import locale
import os

from .consts import SETTING_PATH

__all__ = ["settings"]

# Get the current locale and set the default locale
current_locale, _ = locale.getdefaultlocale()


class Settings:

    DefaultSettings = {
        # settings
        "lang": "zh" if current_locale and current_locale.startswith("zh") else "en",
    }

    def __init__(self):
        self.__settings = self.DefaultSettings
        self.load_from_file()

    def save_to_file(self):
        with open(SETTING_PATH, "w", encoding="utf-8") as fp:
            json.dump(self.__settings, fp, indent=4)

    def load_from_file(self):
        if not os.path.exists(SETTING_PATH):
            with open(SETTING_PATH, "w", encoding="utf-8") as fp:
                json.dump(self.DefaultSettings, fp, indent=4)
        with open(SETTING_PATH, "r", encoding="utf-8") as fp:
            self.__settings = json.load(fp)

    def get(self, key: str, default=None):
        return self.__settings.get(key, default)

    def set(self, key: str, value):
        self.__settings[key] = value
        self.save_to_file()

settings = Settings()

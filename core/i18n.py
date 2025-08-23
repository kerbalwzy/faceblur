__all__ = ["t"]

from typing import List, Union
from .settings import settings


class I18n:

    def __init__(self, loacle: str, fallbackLocale: str = None, messages: dict = None):
        self.locale = loacle
        self.fallbackLocale = fallbackLocale or loacle
        self.messages = messages or dict()
        assert (
            self.locale in self.messages
        ), f"I18n init error, locale<{loacle}> not in messages locales<{messages.keys()}>"
        assert (
            self.fallbackLocale in self.messages
        ), f"I18n init error, fallbackLocale<{self.fallbackLocale}> not in messages locales<{messages.keys()}>"

    def set_locale(self, locale: str):
        self.locale = locale

    def __find_result_in_message(
        self, locale: str, key_route: List[str]
    ) -> Union[str, None]:
        res = None
        message = self.messages.get(locale)
        for idx, k in enumerate(key_route):
            res = message.get(k, None)
            if idx == len(key_route) - 1:
                break
            if not (res and isinstance(res, dict)):
                res = None
                break
            message = res
        return res

    def t(self, key: str) -> str:
        assert isinstance(key, str)
        key_route = key.split(".")
        # find result in locale message
        res = self.__find_result_in_message(locale=self.locale, key_route=key_route)
        if res is None:
            # find result in fallbackLocale message
            res = self.__find_result_in_message(
                locale=self.fallbackLocale, key_route=key_route
            )
        if res is None:
            return key
        return res

    def __call__(self, key: str) -> str:
        return self.t(key)



t = I18n(
    loacle=settings.get("lang", "zh"),
    fallbackLocale="en",
    messages={
        "zh": {
            "label": {
                "ShowWindow": "显示窗口",
                "Quite": "退出",
                "Info": "信息",
                "Warning": "警告",
                "Error": "错误",
                "Yes": "是",
                "No": "否",
            },
            "msg": {
            },
        },
        "en": {
            "label": {
                "ShowWindow": "Show Window",
                "Quite": "Quite",
                "Info": "Info",
                "Warning": "Warning",
                "Error": "Error",
                "Yes": "Yes",
                "No": "No",
            },
            "msg": {
            },
        },
    },
)
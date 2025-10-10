
import logging
import sys
import colorlog
from logging.handlers import RotatingFileHandler
from core.consts import LOG_PATH


logger = logging.getLogger("faceblur")
logger.setLevel(logging.DEBUG)
logger.handlers.clear()
color_handler = logging.StreamHandler(sys.stdout)
color_handler.setFormatter(
    colorlog.ColoredFormatter(
        "%(log_color)s%(asctime)s [%(levelname)s] %(filename)s:%(lineno)d \t%(message)s",
        datefmt="%x %X",
        log_colors={
            "DEBUG": "cyan",
            "INFO": "green",
            "WARNING": "yellow",
            "ERROR": "red",
            "CRITICAL": "red,bg_white",
        },
    )
)
logger.addHandler(color_handler)
# 添加文件handler
file_handler = RotatingFileHandler(LOG_PATH, maxBytes=1000000, backupCount=1, encoding="utf-8")
file_handler.setFormatter(logging.Formatter(
    "%(asctime)s [%(levelname)s]  %(message)s",
    datefmt="%x %X"
))
file_handler.setLevel(logging.INFO)
logger.addHandler(file_handler)

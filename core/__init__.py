
import logging
import sys
import colorlog

logger = logging.getLogger("faceblur")
logger.setLevel(logging.DEBUG)
logger.handlers.clear()
color_handler = logging.StreamHandler(sys.stdout)
color_handler.setFormatter(
    colorlog.ColoredFormatter(
        "%(log_color)s%(asctime)s [%(levelname)s] %(filename)s:%(lineno)d %(name)s\t%(message)s",
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

import logging
import numpy as np
import onnxruntime as ort
from multiprocessing import Lock
from typing import List
from insightface.app import FaceAnalysis

from .consts import APP_NAME, PROJECT_DIR

logger = logging.getLogger(APP_NAME)
face_rec_lock = Lock()


class FaceRecognizer:

    isinited: bool = False
    providers: List[str] = None
    app: FaceAnalysis = None
    det_thresh: float = 0.65

    @classmethod
    def init(cls):
        logger.info("FaceRecognizer init......")
        cls.providers = list(
            filter(
                lambda x: x
                in [
                    "CUDAExecutionProvider",
                    "CoreMLExecutionProvider",
                    "CPUExecutionProvider",
                ],
                ort.get_available_providers(),
            )
        )
        cls.app = FaceAnalysis(
            name="buffalo_l",
            root=PROJECT_DIR,
            allowed_modules=["detection", "recognition"],
            providers=cls.providers,
        )
        cls.prepare()
        cls.isinited = True

    @classmethod
    def prepare(
        cls,
        det_thresh: float = 0.65,
        det_size=(640, 640),
    ):
        cls.det_thresh = det_thresh
        logger.debug(f"Prepare: det_thresh={det_thresh}, det_size={det_size}")
        try:
            cls.app.prepare(
                ctx_id=(
                    0
                    if "CoreMLExecutionProvider" in cls.providers
                    or "CUDAExecutionProvider" in cls.providers
                    else -1
                ),
                det_thresh=det_thresh,
                det_size=det_size,
            )
        except Exception as e:
            logger.warning(f"Provider setup failed: {e}, falling back to CPU")
            cls.app.prepare(
                ctx_id=-1,
                det_thresh=det_thresh,
                det_size=det_size,
            )
        logger.info("FaceRecognizer prepare done")

    @classmethod
    def get_faces(cls, img: np.ndarray) -> List[dict]:
        """
        :params img: image in bgr24 format
        :return: res
        [
            {
                "postion": (x1, y1, x2, y2),
                "normed_emb": face.normed_embedding,
            }
        ]
        """
        res = []
        with face_rec_lock:
            if not cls.isinited:
                cls.init()
            faces = cls.app.get(img)
            for face in faces:
                x1, y1, x2, y2 = map(int, face.bbox)
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(img.shape[1], x2), min(img.shape[0], y2)
                if x2 > x1 and y2 > y1:
                    face_position = (x1, y1, x2, y2)
                    res.append(
                        {
                            "position": face_position,
                            "normed_emb": face.normed_embedding,
                        }
                    )
        return res

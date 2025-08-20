import logging
import numpy as np
from typing import Any, List
from insightface.app import FaceAnalysis

logger = logging.getLogger("faceblur")


class Recognizer:

    def find(self, frame: Any):
        raise NotImplementedError


class FaceRecognizer(Recognizer):

    def __init__(self):
        self.app = FaceAnalysis(
            name="buffalo_l", allowed_modules=["detection", "recognition"]
        )
        self.prepare()

    def prepare(self, ctx_id=-1, det_thresh: float = 0.5, det_size=(1280, 1280)):
        logger.debug(
            f"prepare: ctx_id={ctx_id} det_thresh={det_thresh}, det_size={det_size}"
        )
        self.app.prepare(ctx_id=ctx_id, det_thresh=det_thresh, det_size=det_size)

    @staticmethod
    def is_same_face(
        normed_emb1: np.ndarray, normed_emb2: np.ndarray, sim_thresh: float = 0.65
    ) -> bool:
        return np.dot(normed_emb1, normed_emb2) >= sim_thresh

    def find(self, frame: np.ndarray) -> List[dict]:
        """
        :params frame: video frame
        :return: res
        [
            {
                "face_normed_emb": face.normed_embedding,
                "face_position": (x1, y1, x2, y2),
            },
            ...
        ]
        """
        res = []
        faces = self.app.get(frame)
        for face in faces:
            face_position = (x1, y1, x2, y2) = map(int, face.bbox)
            res.append(
                {
                    "face_normed_emb": face.normed_embedding,
                    "face_position": face_position,
                }
            )
            logger.debug(f"find face: {face_position}")
        return res


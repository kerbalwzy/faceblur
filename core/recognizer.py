import logging
import cv2
import numpy as np
import onnxruntime as ort
from typing import List
from insightface.app import FaceAnalysis

logger = logging.getLogger("faceblur")


class FaceRecognizer:

    def __init__(self):
        logger.info("FaceRecognizer init......")
        self.providers = list(
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
        self.app = FaceAnalysis(
            name="buffalo_l",
            allowed_modules=["detection", "recognition"],
            providers=self.providers,
        )
        self.sim_thresh = 0.6
        self.faceignore_normed_embs = []
        self.prepare()

    @staticmethod
    def is_same_face(
        normed_emb1: np.ndarray, normed_emb2: np.ndarray, sim_thresh: float = 0.6
    ) -> bool:
        return np.dot(normed_emb1, normed_emb2) >= sim_thresh

    def prepare(
        self, det_thresh: float = 0.6, det_size=(640, 640), sim_thresh: float = 0.6
    ):
        logger.debug(
            f"Prepare: providers={self.providers} det_thresh={det_thresh}, det_size={det_size}, sim_thresh={sim_thresh}"
        )
        try:
            self.app.prepare(
                ctx_id=(
                    0
                    if "CoreMLExecutionProvider" in self.providers
                    or "CUDAExecutionProvider" in self.providers
                    else -1
                ),
                det_thresh=det_thresh,
                det_size=det_size,
            )
        except Exception as e:
            logger.warning(f"Provider setup failed: {e}, falling back to CPU")
            self.app.prepare(
                ctx_id=-1,
                det_thresh=det_thresh,
                det_size=det_size,
            )
        self.sim_thresh = sim_thresh
        logger.info("FaceRecognizer prepare done")

    def set_faceignore(self, face_images: List[str]):
        """
        :param ignore_faces: list of image file path
        :return: None
        """
        for filepath in face_images:
            img = cv2.imread(filepath)
            if img is None:
                logger.error(f"Failed to read image {filepath}")
                continue
            faces = self.app.get(img)
            logger.debug(f"set_faceignore {filepath} faces={len(faces)}")
            if len(faces) == 0:
                continue
            for face in faces:
                self.faceignore_normed_embs.append(face.normed_embedding)
        logger.debug(f"set_faceignore done, ignore_faces={len(self.faceignore_normed_embs)}")

    def is_ignore_face(self, normed_emb: np.ndarray) -> bool:
        """
        :param normed_emb: face normed embedding
        :return: bool
        """
        for ignore_emb in self.faceignore_normed_embs:
            if self.is_same_face(normed_emb, ignore_emb, self.sim_thresh):
                return True
        return False

    def get_blur_position(
        self,
        frame: np.ndarray,
    ) -> List[dict]:
        """
        :params frame: video frame
        :return: res
        [
            {
                "face_normed_emb": face.normed_embedding,
                "face_position": (x1, y1, x2, y2),
                "face_region": <np.ndarray>,
                "frame_idx": frame_idx,
            },
            ...
        ]
        """
        res = []
        faces = self.app.get(frame)
        for face in faces:
            # skip ignore face
            if self.is_ignore_face(face.normed_embedding):
                continue
            x1, y1, x2, y2 = map(int, face.bbox)
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(frame.shape[1], x2), min(frame.shape[0], y2)
            if x2 > x1 and y2 > y1:
                face_position = (x1, y1, x2, y2)
                res.append(face_position)
        return res

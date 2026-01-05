import json
import av
import logging
from av.container import InputContainer
from av.video.stream import VideoStream

from .face import FaceRecognizer

logger = logging.getLogger("faceblur")


class VideoFaceParser:
    """
    Read video file. Parse it to frames.
    Find faces in each frame. Return positions of faces and frame index.
    """

    def __init__(self, video_path: str = None):
        if video_path:
            self.open(video_path)

    def __str__(self):
        return (
            f"VideoFaceParser(TotalFrames:{self.total_frames}, Path:{self.video_path})"
        )

    def open(self, video_path: str):
        self.video_path = video_path
        self.input: InputContainer = av.open(self.video_path, mode="r")
        self.video_stream: VideoStream = self.input.streams.video[0]
        self.video_stream.codec_context.thread_type = "AUTO"
        self.total_frames = self.video_stream.frames
        self.processed_frames = 0
        self.progress = 0.00

    def parse(self):
        """
        faces: [
            {
             "normed_emb": face.normed_embedding,
             "face_img": bytes().hex(),
             "frame_position": [(frame_idx, x1, y1, x2, y2), ...],
            }
        ]
        """
        final_faces = list()
        for frame in self.input.decode(self.video_stream):
            # 处理帧
            frame_img = frame.to_ndarray(format="bgr24")
            frame_faces = FaceRecognizer.get_faces(frame_img)
            for face in frame_faces:
                x1, y1, x2, y2 = face["position"]
                frame_position = (self.processed_frames, x1, y1, x2, y2)
                for exsited_face in final_faces:
                    if FaceRecognizer.is_same_face(
                        exsited_face["normed_emb"], face["normed_emb"]
                    ):
                        exsited_face["frame_position"].append(frame_position)
                        break
                else:
                    face_img = frame_img[y1:y2, x1:x2].tobytes().hex()
                    final_faces.append(
                        {
                            "normed_emb": face["normed_emb"],
                            "face_img": face_img,
                            "frame_position": [frame_position],
                        }
                    )
                
            # 记录进度
            self.processed_frames += 1
            self.progress = round(self.processed_frames / self.total_frames, 2)
            logger.info(f"{self} Processed {self.progress*100:.0f}% frames")
        with open(f"{self.video_path}.faces", "w") as f:
            f.write(json.dumps(faces))

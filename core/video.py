import hashlib
import json
import os
import time
import av
import logging
import cv2
import numpy as np
from functools import cached_property
from typing import Callable, List, Dict, Optional, Union
from dataclasses import dataclass, asdict
from pathlib import Path
from av.container import InputContainer, OutputContainer
from av.video.stream import VideoStream

from core import consts
from core.face import FaceRecognizer


logger = logging.getLogger("faceblur")


@dataclass
class FacePosition:

    frame_idx: int
    x1: int
    y1: int
    x2: int
    y2: int

    def to_dict(self):
        return asdict(self)


@dataclass
class TrackedFace:

    track_id: int
    normed_emb: np.ndarray
    img: str
    positions: List[FacePosition]

    def to_json(self) -> Dict:
        return {
            "track_id": self.track_id,
            "img": self.img,
            "positions": [pos.to_dict() for pos in self.positions],
        }


class VideoFaceParser:

    def __init__(self, video_path: str = None, track_thresh: float = 0.65):
        self.video_path = Path(video_path).absolute().as_posix()
        self.task_id = hashlib.md5(self.video_path.encode()).hexdigest()
        # open video file
        self.input: InputContainer = av.open(self.video_path, mode="r")
        self.video_stream: VideoStream = self.input.streams.video[0]
        self.video_stream.codec_context.thread_type = "AUTO"
        self.total_frames = self.video_stream.frames
        if self.total_frames <= 0:
            self.total_frames = int(
                self.video_stream.duration * self.video_stream.base_rate
            )
        self.processed_frames = 0
        self.progress = 0.0
        self.canceled = False
        # tracking status
        self.total_faces_detected = 0
        self.tracked_faces: Dict[int, TrackedFace] = {}
        self.next_track_id = 0
        self._emb_cache: Dict[int, np.ndarray] = {}
        # threshold config
        self.track_thresh = track_thresh
        logger.info(f"{self} init done.")

    def __str__(self):
        return f"VideoFaceParser({self.video_path}) "

    def parse(self, callback: Callable[[float, int], None] = None) -> Dict:
        """
        Parse the video and track faces.

        Args:
            callback(progress:float, unique_faces_tracked:int)

        Returns:
            parse result dict, by self._generate_result()
        """
        t_start = time.time()
        try:
            for packet in self.input.demux(self.video_stream):
                if self.canceled:
                    break
                for frame in packet.decode():
                    self._process_frame(frame)
                    # update progress
                    self.processed_frames += 1
                    self.progress = self.processed_frames / max(self.total_frames, 1)
                    # call callback
                    if callback:
                        callback(self.progress, len(self.tracked_faces))
                    # log progress
                    if self.processed_frames % 30 == 0:
                        logger.info(
                            f"{self} Progress: {self.progress*100:.1f}%, "
                            f"Detected Faces: {self.total_faces_detected}, "
                            f"Tracked Faces: {len(self.tracked_faces)}"
                        )
        except Exception as e:
            raise e
        finally:
            self.input.close()
        result = self._generate_result
        self._save_result(result)
        elapsed_time = time.time() - t_start
        self._print_statistics(elapsed_time)

        return result

    def cancel(self):
        # Use for multi-threading
        self.canceled = True

    def _process_frame(self, frame) -> None:
        frame_img = frame.to_ndarray(format="bgr24")
        frame_faces = FaceRecognizer.get_faces(frame_img)

        for face in frame_faces:
            self.total_faces_detected += 1
            x1, y1, x2, y2 = face["position"]
            face_position = FacePosition(
                frame_idx=self.processed_frames, x1=x1, y1=y1, x2=x2, y2=y2
            )

            # find matching track
            track_id = self._find_matching_track(face["normed_emb"])
            #
            if track_id is None:
                # new track
                track_id = self.next_track_id
                self.next_track_id += 1
                # save face thumbnail
                img_path = self._save_face_thumbnail(frame_img, face["position"])
                self.tracked_faces[track_id] = TrackedFace(
                    track_id=track_id,
                    img=img_path,
                    normed_emb=face["normed_emb"].copy(),
                    positions=[face_position],
                )
                self._emb_cache[track_id] = face["normed_emb"].copy()
            else:
                # match existing track
                self.tracked_faces[track_id].positions.append(face_position)
                # update embedding cache
                self._update_embedding(track_id, face["normed_emb"])

    def _find_matching_track(self, current_emb: np.ndarray) -> Optional[int]:
        best_match_id = None
        best_similarity = self.track_thresh

        for track_id, cached_emb in self._emb_cache.items():
            similarity = np.dot(current_emb, cached_emb)

            if similarity > best_similarity:
                best_similarity = similarity
                best_match_id = track_id

        return best_match_id

    def _update_embedding(self, track_id: int, new_emb: np.ndarray, alpha: float = 0.3):
        """
        update the embedding cache of the track with the new embedding.
        """
        old_emb = self._emb_cache[track_id]
        # update the embedding cache with exponential moving average
        updated_emb = alpha * new_emb + (1 - alpha) * old_emb
        # normalize the updated embedding
        updated_emb = updated_emb / np.linalg.norm(updated_emb)
        self._emb_cache[track_id] = updated_emb
        # update the normed_emb of the track
        self.tracked_faces[track_id].normed_emb = updated_emb.copy()

    @cached_property
    def _generate_result(self) -> Dict:
        sorted_tracks = sorted(self.tracked_faces.values(), key=lambda x: x.track_id)
        return {
            "video_info": {
                "path": self.video_path,
                "task_id": self.task_id,
                "total_frames": self.total_frames,
                "width": self.video_stream.width,
                "height": self.video_stream.height,
            },
            "processing_info": {
                "processed_frames": self.processed_frames,
                "total_faces_detected": self.total_faces_detected,
                "unique_faces_tracked": len(self.tracked_faces),
                "processing_timestamp": time.time(),
            },
            "faces": [track.to_json() for track in sorted_tracks],
        }

    def _save_face_thumbnail(
        self, frame_img, position, size=(128, 128)
    ) -> Optional[str]:
        """
        截取以原始人脸区域中心为中心，向外扩展原始区域高和宽1.5倍的正方形区域

        当边界距离不够时，调整中心点位置，使四个方向的扩展长度始终一致

        Args:
            frame_img: 完整帧图像
            position: 人脸位置 (x1, y1, x2, y2)
            size: 输出缩略图大小

        Returns:
            缩略图的URI路径，如果失败则返回None
        """
        x1, y1, x2, y2 = position
        frame_height, frame_width = frame_img.shape[:2]

        # 验证人脸区域是否有效
        if x1 >= x2 or y1 >= y2:
            logger.warning(f"Invalid face position: ({x1}, {y1}, {x2}, {y2})")
            return None

        # 确保坐标在图像范围内
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(frame_width, x2), min(frame_height, y2)

        # 计算原始区域的宽和高
        w = x2 - x1
        h = y2 - y1

        if w <= 0 or h <= 0:
            logger.warning(f"Zero or negative face dimensions: w={w}, h={h}")
            return None

        # 计算原始人脸区域的中心点
        center_x = (x1 + x2) // 2
        center_y = (y1 + y2) // 2

        # 计算扩展后的正方形边长（原始区域的1.5倍）
        side_length = int(max(w, h) * 1.5)

        # 确保边长不小于原始区域的最大边长
        side_length = max(side_length, max(w, h))

        # 计算半边长
        half_side = side_length // 2

        # 初始计算正方形区域（以原始中心点为中心）
        new_x1 = center_x - half_side
        new_y1 = center_y - half_side
        new_x2 = new_x1 + side_length
        new_y2 = new_y1 + side_length

        # 检查是否需要调整中心点
        adjust_x = 0
        adjust_y = 0

        # X轴方向调整
        if new_x1 < 0:
            # 左边界超出，需要向右移动中心点
            adjust_x = -new_x1
        elif new_x2 > frame_width:
            # 右边界超出，需要向左移动中心点
            adjust_x = frame_width - new_x2

        # Y轴方向调整
        if new_y1 < 0:
            # 上边界超出，需要向下移动中心点
            adjust_y = -new_y1
        elif new_y2 > frame_height:
            # 下边界超出，需要向上移动中心点
            adjust_y = frame_height - new_y2

        # 应用中心点调整
        if adjust_x != 0 or adjust_y != 0:
            # 计算调整后的中心点
            center_x = center_x + adjust_x
            center_y = center_y + adjust_y

            # 重新计算正方形区域（使用调整后的中心点）
            new_x1 = center_x - half_side
            new_y1 = center_y - half_side
            new_x2 = new_x1 + side_length
            new_y2 = new_y1 + side_length

        # 再次检查边界（防止调整后仍然超出）
        if new_x1 < 0:
            # 如果仍然超出左边界，强制调整
            shift_x = -new_x1
            new_x1 += shift_x
            new_x2 += shift_x

        if new_x2 > frame_width:
            # 如果仍然超出右边界，强制调整
            shift_x = new_x2 - frame_width
            new_x1 -= shift_x
            new_x2 -= shift_x

        if new_y1 < 0:
            # 如果仍然超出上边界，强制调整
            shift_y = -new_y1
            new_y1 += shift_y
            new_y2 += shift_y

        if new_y2 > frame_height:
            # 如果仍然超出下边界，强制调整
            shift_y = new_y2 - frame_height
            new_y1 -= shift_y
            new_y2 -= shift_y

        # 最终边界检查
        new_x1 = max(0, int(new_x1))
        new_y1 = max(0, int(new_y1))
        new_x2 = min(frame_width, int(new_x2))
        new_y2 = min(frame_height, int(new_y2))

        # 确保宽高有效
        if new_x2 <= new_x1 or new_y2 <= new_y1:
            # 如果扩展区域无效，使用原始区域
            logger.warning("Expanded region invalid, falling back to original region")
            new_x1, new_y1, new_x2, new_y2 = x1, y1, x2, y2

        # 从原始帧中截取扩展区域
        expanded_roi = frame_img[new_y1:new_y2, new_x1:new_x2]

        if (
            expanded_roi.size == 0
            or expanded_roi.shape[0] == 0
            or expanded_roi.shape[1] == 0
        ):
            logger.warning(
                f"Empty ROI after expansion: ({new_x1}, {new_y1}, {new_x2}, {new_y2})"
            )
            return None

        # 调整到目标大小
        thumbnail = cv2.resize(expanded_roi, size, interpolation=cv2.INTER_AREA)

        # 编码为jpg格式
        success, buffer = cv2.imencode(".jpg", thumbnail)
        if not success:
            logger.warning("Failed to encode thumbnail to JPG")
            return None

        # 保存图像
        img_bytes = buffer.tobytes()
        md5_hash = hashlib.md5(img_bytes).hexdigest()
        img_name = f"{md5_hash}.jpg"
        img_path = os.path.join(consts.TEMP_FACES_IMG_DIR, img_name)
        cv2.imwrite(img_path, thumbnail)

        return Path(img_path).absolute().as_uri()

    def _save_face_thumbnail_(self, face_roi, size=(128, 128)) -> Optional[str]:
        if face_roi.size == 0 or face_roi.shape[0] == 0 or face_roi.shape[1] == 0:
            return None
        # resize the face roi to the specified size
        h, w = face_roi.shape[:2]
        scale = min(size[0] / w, size[1] / h)
        new_w, new_h = int(w * scale), int(h * scale)
        if new_w == 0 or new_h == 0:
            new_w, new_h = min(w, size[0]), min(h, size[1])
        thumbnail = cv2.resize(face_roi, (new_w, new_h))
        # encode the thumbnail to jpg format
        success, buffer = cv2.imencode(".jpg", thumbnail)
        if not success:
            return None
        # save the thumbnail to the temp faces img dir
        img_bytes = buffer.tobytes()
        md5_hash = hashlib.md5(img_bytes).hexdigest()
        img_name = f"{md5_hash}.jpg"
        img_path = os.path.join(consts.TEMP_FACES_IMG_DIR, img_name)
        cv2.imwrite(img_path, thumbnail)
        return Path(img_path).absolute().as_uri()

    def _save_result(self, result: Dict) -> None:
        """save the result to a json file"""
        output_path = os.path.join(
            consts.TEMP_FACES_RES_DIR,
            f"{self.task_id}.faces.json",
        )
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        logger.info(f"save result to: {output_path}")

    def _print_statistics(self, elapsed_time: float) -> None:
        """print the statistics of the video face parsing"""
        if self.canceled:
            logger.info(f"{self} Parse Cancelled")
        else:
            logger.info(f"{self} Parse Completed")
        logger.info(f"Total Frames: {self.total_frames}")
        logger.info(f"Processing Time: {elapsed_time:.2f} seconds")
        logger.info(
            f"Frame Processing Speed: {self.processed_frames/elapsed_time:.1f} fps"
        )
        logger.info(f"Total Faces Detected: {self.total_faces_detected}")
        logger.info(f"Unique Faces Tracked: {len(self.tracked_faces)}")


class VideoFaceBlurTool:
    def __init__(self, video_path: str, task_id: str, blur_track_ids: List[int]):
        self.video_path = Path(video_path)
        video_format = self.video_path.suffix[1:]
        self.output_path = (
            self.video_path.with_suffix(f".blurred.{video_format}")
            .absolute()
            .as_posix()
        )
        self.task_id = task_id
        self.blur_track_ids = blur_track_ids
        self.canceled = False

        # input video container and stream
        self.input = av.open(self.video_path.absolute().as_posix(), mode="r")
        self.input_video_stream: av.VideoStream = self.input.streams.video[0]
        self.input_video_stream.codec_context.thread_type = "AUTO"
        self.input_audio_stream: Union[bool, av.AudioStream] = (
            bool(self.input.streams.audio) and self.input.streams.audio[0]
        )
        if self.input_audio_stream:
            self.input_audio_stream.codec_context.thread_type = "AUTO"
        #
        self.total_frames = self.input_video_stream.frames
        if self.total_frames <= 0:
            self.total_frames = int(
                self.input_video_stream.duration * self.input_video_stream.base_rate
            )

        self.processed_frames = 0
        self.progress = 0.0
        # output video container and stream
        self.output: OutputContainer = av.open(
            file=self.output_path,
            mode="w",
            format=video_format,
        )
        self.output_video_stream: av.VideoStream = self.output.add_stream(
            codec_name="h264",
            rate=self.input_video_stream.codec_context.rate,
            width=self.input_video_stream.codec_context.width,
            height=self.input_video_stream.codec_context.height,
            pix_fmt=self.input_video_stream.codec_context.pix_fmt,
            bit_rate=self.input_video_stream.codec_context.bit_rate,
            thread_type=self.input_video_stream.codec_context.thread_type,
            time_base=self.input_video_stream.time_base,
            options={"preset": "ultrafast"},
        )
        self.output_audio_stream: Union[bool, av.AudioStream] = bool(
            self.input.streams.audio
        ) and self.output.add_stream(
            codec_name=self.input_audio_stream.codec_context.name,
            rate=self.input_audio_stream.codec_context.rate,
            format=self.input_audio_stream.codec_context.format,
            bit_rate=self.input_audio_stream.codec_context.bit_rate,
            thread_type=self.input_audio_stream.codec_context.thread_type,
        )
        #
        self.faces_to_blur = self._get_faces_to_blur()

    def __str__(self):
        return f"VideoBlurer({self.video_path.absolute().as_posix()})"

    def _get_faces_to_blur(self):
        """
        get the positions of the faces to blur from the result json file
        filter by the task id and blur track ids
        """
        result_path = os.path.join(
            consts.TEMP_FACES_RES_DIR,
            f"{self.task_id}.faces.json",
        )
        with open(result_path, "r", encoding="utf-8") as f:
            result = json.load(f)
        faces_to_blur = {}
        for face in result["faces"]:
            if face["track_id"] in self.blur_track_ids:
                for pos in face["positions"]:
                    faces_to_blur.setdefault(pos.pop("frame_idx"), []).append(pos)
        return faces_to_blur

    def _blur_frame(self, frame: av.VideoFrame):
        """
        blur the faces in the frame
        """
        img = frame.to_ndarray(format="bgr24")
        blur_pos = self.faces_to_blur.pop(self.processed_frames, [])
        for pos in blur_pos:
            x1, y1, x2, y2 = pos["x1"], pos["y1"], pos["x2"], pos["y2"]
            img[y1:y2, x1:x2] = cv2.GaussianBlur(img[y1:y2, x1:x2], (99, 99), 30)
        blurred_frame = av.VideoFrame.from_ndarray(img, format="bgr24")
        blurred_frame.pts = frame.pts
        blurred_frame.time_base = frame.time_base
        return blurred_frame

    def blur(self, callback=None):
        t_start = time.time()
        # copy audio data
        if self.input_audio_stream:
            for packet in self.input.demux(self.input_audio_stream):
                if self.canceled:
                    break
                packet.stream = self.output_audio_stream
                self.output.mux(packet)
            self.input.seek(0)
        # blur and copy video data
        for frame in self.input.decode(self.input_video_stream):
            if self.canceled:
                break
            frame = self._blur_frame(frame)
            for output_packet in self.output_video_stream.encode(frame):
                if self.canceled:
                    break
                self.output.mux(output_packet)
            # update progress
            self.processed_frames += 1
            progress = self.processed_frames / max(self.total_frames, 1)
            self.progress = progress
            # call callback function
            if callback:
                callback(progress, self.total_frames, self.processed_frames)
            # log progress
            if self.processed_frames % 30 == 0:
                logger.info(f"{self} Progress: {progress*100:.1f}%")
        # flush video encoder
        for packet in self.output_video_stream.encode():
            if self.canceled:
                break
            self.output.mux(packet)
        # log statistics
        elapsed_time = time.time() - t_start
        self._print_statistics(elapsed_time)

    def cancel(self):
        # Use for multi-threading
        self.canceled = True

    def _print_statistics(self, elapsed_time: float) -> None:
        if self.canceled:
            logger.info(f"{self} Blur Cancelled")
        else:
            logger.info(f"{self} Blur Completed")
        logger.info(f"Total Frames: {self.total_frames}")
        logger.info(f"Elapsed Time: {elapsed_time:.2f} seconds")
        logger.info(
            f"Frame Processing Speed: {self.processed_frames/elapsed_time:.1f} fps"
        )

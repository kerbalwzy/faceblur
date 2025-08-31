import time
import av
import cv2
from typing import Any, Iterator, Tuple
from PIL import Image
import numpy as np


class FPSCounter:
    def __init__(self):
        self.start_time = time.time()
        self.frame_count = 0

    def update(self):
        self.frame_count += 1
        current_time = time.time()
        elapsed = current_time - self.start_time
        if elapsed > 1:  # 每秒更新一次
            self.fps = self.frame_count / elapsed
            self.start_time = current_time
            self.frame_count = 0
        return getattr(self, "fps", 0)

    def get_fps(self):
        return self.fps


def frame_preview(
    frame, window_title: str = "Frame Preview", max_width: int = None, fps_counter=None
):
    if max_width and max_width > 0:
        height = int(frame.shape[0] * (max_width / frame.shape[1]))
        frame = cv2.resize(frame, (max_width, height))

    # 显示FPS
    if fps_counter:
        fps = fps_counter.update()
        cv2.putText(
            frame,
            f"FPS: {fps:.1f}",
            (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2,
        )

    cv2.imshow(window_title, frame)
    if (
        cv2.waitKey(1) == 27
        or cv2.getWindowProperty(window_title, cv2.WND_PROP_VISIBLE) < 1
    ):
        return False
    return True


def systray_darwin_icon(icon: Image.Image) -> Image.Image:
    if icon.mode != "RGBA":
        icon = icon.convert("RGBA")
    icon = icon.copy()
    data = np.array(icon)
    alpha = data[:, :, 3]
    data[alpha > 0, :3] = [255, 255, 255]
    icon = Image.fromarray(data)
    return icon


def video_total_duration(video_stream: av.VideoStream) -> float:
    """获取视频总时长（秒）"""
    if video_stream.duration and video_stream.time_base:
        return float(video_stream.duration * video_stream.time_base)
    return 0.0


def video_total_frames(stream: av.VideoStream) -> int:
    if stream.frames > 0:
        return stream.frames
    if stream.duration and stream.average_rate:
        duration_seconds = float(stream.duration * stream.time_base)
        frame_rate = float(stream.average_rate)
        return int(duration_seconds * frame_rate)
    return 0


def video_frame_thumbnails(
    video: Any, interval: float = 1.0
) -> Iterator[Tuple[Image.Image, float]]:
    """
    Generator function that yields video frame thumbnails at specified intervals.

    :param video: File path or video stream object
    :param interval: Time interval between extracted frames in seconds
    :yield: Tuple containing (frame_image, timestamp) for each extracted frame
    :raises ValueError: If video has no video stream or zero duration
    """
    with av.open(video) as container:
        # Validate video stream exists
        if not container.streams.video:
            raise ValueError("Video must contain at least one video stream")
        video_stream = container.streams.video[0]
        duration = video_total_duration(video_stream)
        if duration <= 0:
            raise ValueError("Video duration must be greater than 0")
        # Calculate time points ensuring we cover the entire duration
        num_frames = int(duration / interval) + 1
        time_points = [min(i * interval, duration) for i in range(num_frames)]
        thumbnail_size = None

        for time_point in time_points:
            # Seek to the target timestamp
            container.seek(
                offset=int(time_point * video_stream.time_base), stream=video_stream
            )
            # Decode frames and find the closest one to our target time
            closest_frame = None
            min_time_diff = float("inf")

            for frame in container.decode(video_stream):
                frame_time = float(frame.pts * frame.time_base)
                time_diff = abs(frame_time - time_point)
                if time_diff < min_time_diff:
                    min_time_diff = time_diff
                    closest_frame = frame
                # Stop if we're moving further away from target time
                if frame_time > time_point + 1.0:  # 1 second buffer
                    break

            if closest_frame and min_time_diff < 2.0:  # 2 second maximum tolerance
                frame_image = closest_frame.to_image()
                # Determine thumbnail size based on aspect ratio
                if thumbnail_size is None:
                    width, height = frame_image.size
                    thumbnail_size = (int(width / 10), int(height / 10))
                # Resize frame to thumbnail dimensions
                resized_frame = frame_image.resize(thumbnail_size)
                # Yield the frame and its actual timestamp
                yield resized_frame, float(closest_frame.pts * closest_frame.time_base)

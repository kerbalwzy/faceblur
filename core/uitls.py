import time
from av import VideoStream
import cv2


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


def video_total_duration(video_stream: VideoStream) -> float:
    """获取视频总时长（秒）"""
    if video_stream.duration and video_stream.time_base:
        return float(video_stream.duration * video_stream.time_base)
    return 0.0

def video_total_frames(stream: VideoStream) -> int:
    if stream.frames > 0:
        return stream.frames
    if stream.duration and stream.average_rate:
        duration_seconds = float(stream.duration * stream.time_base)
        frame_rate = float(stream.average_rate)
        return int(duration_seconds * frame_rate)
    return 0

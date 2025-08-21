import logging
import time
import av

from typing import Union

import av.container
import cv2
from core.uitls import video_total_duration


from .recognizer import FaceRecognizer


logger = logging.getLogger("faceblur")


class VideoBlurer:

    def __init__(self, recognizer: FaceRecognizer, input: str):
        self.recognizer = recognizer
        #
        input_name, input_fmt = input.rsplit(".", 1)
        output = input_name + "_blurred." + input_fmt
        #
        self.input: av.container.InputContainer = av.open(
            input, mode="r", format=input_fmt
        )
        self.input_video_stream: av.VideoStream = self.input.streams.video[0]
        self.input_video_stream.codec_context.thread_type = "AUTO"
        self.input_audio_stream: Union[bool, av.AudioStream] = (
            bool(self.input.streams.audio) and self.input.streams.audio[0]
        )
        if self.input_audio_stream:
            self.input_audio_stream.codec_context.thread_type == "AUTO"
        #
        self.total_duration: float = video_total_duration(self.input_video_stream)
        if self.total_duration == 0.0:
            logger.warning("Video total duration is 0.0")
        # analyzed progress rate, max value is 100, -1 means unknown
        self.progress: int = 0
        #
        self.output: av.container.OutputContainer = av.open(
            output,
            mode="w",
            format=input_fmt,
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

    def __del__(self):
        try:
            self.input.close()
            self.output.close()
        except:
            pass

    def __print_progress(self, frame: av.VideoFrame):
        if not frame.pts:
            return
        current_time = float(frame.pts * self.input_video_stream.time_base)
        self.progress = (
            min(int(current_time / self.total_duration * 100), 100)
            if self.total_duration > 0
            else -1
        )
        print(f"Video analyze progress: {self.progress}% \r", end="")

    def __blur_frame(self, frame: av.VideoFrame) -> av.VideoFrame:
        img = frame.to_ndarray(format="bgr24")
        blur_positions = self.recognizer.get_blur_position(frame=img)
        if blur_positions:
            for x1, y1, x2, y2 in blur_positions:
                img[y1:y2, x1:x2] = cv2.GaussianBlur(img[y1:y2, x1:x2], (99, 99), 30)
        blurred_frame = av.VideoFrame.from_ndarray(img, format="bgr24")
        blurred_frame.pts = frame.pts
        blurred_frame.time_base = frame.time_base
        return blurred_frame

    def process(self):
        start_time = time.time()
        # copy audio first
        if self.input_audio_stream:
            for packet in self.input.demux(self.input_audio_stream):
                packet.stream = self.output_audio_stream
                self.output.mux(packet)
            self.input.seek(0)
            logger.debug(f"Audio stream copied, cost time: {time.time() - start_time}")
        # blur and copy video
        start_time = time.time()
        for frame in self.input.decode(self.input_video_stream):
            frame = self.__blur_frame(frame)
            for output_packet in self.output_video_stream.encode(frame):
                self.output.mux(output_packet)
            self.__print_progress(frame)
        # flush encoder, avoid frame drops
        for packet in self.output_video_stream.encode():
            self.output.mux(packet)
        logger.debug(f"Video stream copied, cost time: {time.time() - start_time}s")


# class VideoHandler:
#     def __init__(
#         self, input: str, blur_handlers: List[BlurHandler] = None, output: str = None
#     ):
#         input_name, input_fmt = input.rsplit(".", 1)
#         if not output:
#             output = input_name + "_blured." + input_fmt

#         self.frame_count: int = 0
#         self.input: InputContainer = av.open(input, mode="r", format=input_fmt)
#         self.output: OutputContainer = av.open(
#             output,
#             mode="w",
#             format=input_fmt,
#         )
#         self.blur_handlers: List[BlurHandler] = blur_handlers or []

#         self.input_video_stream: VideoStream = self.input.streams.video[0]
#         self.input_video_stream.codec_context.thread_type = "AUTO"
#         self.input_audio_stream: Union[bool, AudioStream] = (
#             bool(self.input.streams.audio) and self.input.streams.audio[0]
#         )
#         if self.input_audio_stream:
#             self.input_audio_stream.codec_context.thread_type == "AUTO"

#         self.output_video_stream: VideoStream = self.output.add_stream(
#             codec_name="h264",
#             rate=self.input_video_stream.codec_context.rate,
#             width=self.input_video_stream.codec_context.width,
#             height=self.input_video_stream.codec_context.height,
#             pix_fmt=self.input_video_stream.codec_context.pix_fmt,
#             bit_rate=self.input_video_stream.codec_context.bit_rate,
#             thread_type=self.input_video_stream.codec_context.thread_type,
#             time_base=self.input_video_stream.time_base,
#             options={
#                 "preset": "ultrafast",  # 更快编码
#             },
#         )
#         self.output_audio_stream: Union[bool, AudioStream] = bool(
#             self.input.streams.audio
#         ) and self.output.add_stream(
#             codec_name=self.input_audio_stream.codec_context.name,
#             rate=self.input_audio_stream.codec_context.rate,
#             format=self.input_audio_stream.codec_context.format,
#             bit_rate=self.input_audio_stream.codec_context.bit_rate,
#             thread_type=self.input_audio_stream.codec_context.thread_type,
#         )
#         self.total_duration: float = video_total_duration(self.input_video_stream)
#         if self.total_duration == 0.0:
#             print(
#                 "Warning: Could not determine total duration, progress will show processed time only."
#             )

#     def __del__(self):
#         try:
#             self.input.close()
#             self.output.close()
#         except:
#             pass

#     def process(self):
#         """处理视频，应用模糊并显示基于时长的进度"""
#         start_time = time.time()
#         last_processed_time = 0.0
#         try:
#             for packet in self.input.demux():
#                 if packet.stream.type == "video" and packet.dts is not None:
#                     for frame in packet.decode():
#                         frame:av.VideoFrame
#                         img = frame.to_ndarray(format="bgr24")
#                         for handler in self.blur_handlers:
#                             img = handler.blur(img)
#                         output_frame = av.VideoFrame.from_ndarray(img, format="bgr24")
#                         output_frame.pts = frame.pts
#                         output_frame.time_base = self.input_video_stream.time_base
#                         for output_packet in self.output_video_stream.encode(
#                             output_frame
#                         ):
#                             self.output.mux(output_packet)
#                         self.frame_count += 1
#                         current_time = float(
#                             frame.pts * self.input_video_stream.time_base
#                         )
#                         if (
#                             self.frame_count % 30 == 0
#                             or current_time >= self.total_duration
#                         ):
#                             if self.total_duration > 0.0:
#                                 progress = (current_time / self.total_duration) * 100
#                                 print(
#                                     f"Progress: {current_time:.2f}/{self.total_duration:.2f} seconds ({progress:.2f}%)\r",
#                                     end="",
#                                 )
#                             else:
#                                 print(f"Progress: {current_time:.2f} seconds processed")
#                         last_processed_time = current_time
#                 elif (
#                     packet.stream.type == "audio"
#                     and packet.dts is not None
#                     and self.output_audio_stream
#                 ):
#                     for frame in packet.decode():
#                         for output_packet in self.output_audio_stream.encode(frame):
#                             self.output.mux(output_packet)

#             for packet in self.output_video_stream.encode():
#                 self.output.mux(packet)
#             if self.output_audio_stream:
#                 for packet in self.output_audio_stream.encode():
#                     self.output.mux(packet)

#         except Exception as e:
#             print(f"Error processing video: {e}")
#             raise e
#         finally:
#             print(
#                 f"Completed processing. Total frames: {self.frame_count}, Duration: {last_processed_time:.2f} seconds"
#             )
#             end_time = time.time()
#             print(f"Total time: {end_time - start_time:.2f} seconds")

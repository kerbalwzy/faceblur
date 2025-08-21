import argparse
import cv2
import numpy as np
import av
from insightface.app import FaceAnalysis

def frame_cv_preview(window_title, frame, max_width:int=None, fps_counter=None):
    if max_width and max_width > 0:
        height = int(frame.shape[0] * (max_width / frame.shape[1]))
        frame = cv2.resize(frame, (max_width, height))
    
    # 显示FPS
    if fps_counter:
        fps = fps_counter.update()
        cv2.putText(frame, f"FPS: {fps:.1f}", (10, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    
    cv2.imshow(window_title, frame)
    if cv2.waitKey(1) == 27 or cv2.getWindowProperty(window_title, cv2.WND_PROP_VISIBLE) < 1:
        return False
    return True


def parse_args():
    parser = argparse.ArgumentParser(
        description="Face detection and recognition with Gaussian blur"
    )
    parser.add_argument("--video", type=str, help="Path to input video")
    parser.add_argument("--img", type=str, help="Path to input image")
    parser.add_argument(
        "--exclude-face",
        default=[],
        action="append",
        help="Path to excluded face images (can be used multiple times)",
    )
    parser.add_argument(
        "--output", type=str, help="Path to save output (image or video)"
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.7,
        help="Cosine similarity threshold for face recognition (0.0 to 1.0)",
    )
    parser.add_argument(
        "--skip-frame",
        type=int,
        default=3,
        help="Number of frames to skip for video processing (1 to 5)",
    )
    args = parser.parse_args()

    if not args.video and not args.img:
        parser.error("At least one of --video or --img must be provided")
    if args.skip_frame < 1 or args.skip_frame > 5:
        parser.error("skip-frame must be between 1 and 10")
    if args.threshold < 0.0 or args.threshold > 1.0:
        parser.error("threshold must be between 0.0 and 1.0")
    return args


def get_face_embeddings(app, img_path):
    img = cv2.imread(img_path)
    if img is None:
        raise ValueError(f"Cannot read image: {img_path}")
    faces = app.get(img)
    return [face.embedding for face in faces]


def get_excluded_embeddings(app, exclude_face):
    embeddings = []
    if exclude_face:
        for filename in exclude_face:
            if filename.lower().endswith((".png", ".jpg", ".jpeg")):
                embeddings.extend(
                    get_face_embeddings(app, filename)
                )
    return embeddings


def cosine_similarity(emb1, emb2):
    return np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2))


def blur_faces(img, faces, exclude_embeddings, threshold):
    for face in faces:
        emb = face.embedding
        is_excluded = (
            any(
                cosine_similarity(emb, ex_emb) > threshold
                for ex_emb in exclude_embeddings
            )
            if exclude_embeddings
            else False
        )
        if not is_excluded:
            x1, y1, x2, y2 = map(int, face.bbox)
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(img.shape[1], x2), min(img.shape[0], y2)
            if x2 > x1 and y2 > y1:
                face_region = img[y1:y2, x1:x2]
                blurred = cv2.GaussianBlur(face_region, (99, 99), 30)
                img[y1:y2, x1:x2] = blurred
    return img


def process_image(app, img_path, exclude_embeddings, output_path, threshold):
    img = cv2.imread(img_path)
    if img is None:
        raise ValueError(f"Cannot read image: {img_path}")
    faces = app.get(img)
    img = blur_faces(img, faces, exclude_embeddings, threshold)
    output_path = output_path or "output_blurred.jpg"
    cv2.imwrite(output_path, img)
    print(f"Processed image saved to {output_path}")


def process_video(
    app, video_path, exclude_embeddings, output_path, threshold, skip_frame
):
    input_container = av.open(video_path)
    video_stream = input_container.streams.video[0]
    fps = video_stream.average_rate
    width = video_stream.width
    height = video_stream.height

    output_path = output_path or "output_blurred.flv"
    output_container = av.open(output_path, mode="w")
    output_video_stream = output_container.add_stream("h264", rate=fps)
    output_video_stream.width = width
    output_video_stream.height = height
    output_video_stream.pix_fmt = "yuv420p"

    # Copy audio stream if present
    if input_container.streams.audio:
        audio_stream = output_container.add_stream("aac")
        for packet in input_container.demux(audio_stream):
            if packet.stream.type == "audio":
                packet.stream = audio_stream
                output_container.mux(packet)
        print("Audio stream copied")

    frame_idx = 0
    for frame in input_container.decode(video_stream):
        if frame_idx % skip_frame == 0:
            # Convert AV frame to OpenCV format (BGR)
            img = frame.to_ndarray(format="bgr24")
            faces = app.get(img)
            img = blur_faces(img, faces, exclude_embeddings, threshold)
        # Convert back to AV frame
        frame = av.VideoFrame.from_ndarray(img, format="bgr24")
        for packet in output_video_stream.encode(frame):
            output_container.mux(packet)
        frame_idx += 1
        print(f"Processed frame {frame_idx}")

    # Flush encoder
    for packet in output_video_stream.encode():
        output_container.mux(packet)

    input_container.close()
    output_container.close()
    print(f"Processed video saved to {output_path}")


def main():
    args = parse_args()

    # Initialize InsightFace
    app = FaceAnalysis(name="buffalo_l", allowed_modules=["detection", "recognition"])
    app.prepare(ctx_id=0, det_size=(640, 640))

    # Get excluded face embeddings
    exclude_embeddings = get_excluded_embeddings(
        app, args.exclude_face,
    )

    # Process image or video
    if args.img:
        process_image(app, args.img, exclude_embeddings, args.output, args.threshold)
    elif args.video:
        process_video(
            app,
            args.video,
            exclude_embeddings,
            args.output,
            args.threshold,
            args.skip_frame,
        )


if __name__ == "__main__":
    main()

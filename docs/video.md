# 视频处理

## 流程

```
视频文件 → <video> 元素（objectURL）
              ↓ 逐帧 seek
        OffscreenCanvas（原始分辨率）
              ↓ createImageBitmap（副本）
        Worker 检测（固定 320）
              ↓
        FaceTracker 平滑补全（防闪烁）
              ↓
        绘制遮挡 → VideoEncoder → mp4-muxer / webm-muxer
              ↓
             Blob 下载
```

## 两条导出路径

| 路径 | 条件 | 速度 | 质量可控性 |
|---|---|---|---|
| **WebCodecs**（首选） | 支持 `VideoEncoder` | 快于实时（实测 2 秒视频约 2.3 秒） | 完全可控（码率、帧序、关键帧） |
| MediaRecorder（降级） | 不支持 WebCodecs | ≈ 实时 | 码率不可控，会因卡顿丢帧 |

降级时 UI 会标注「实时录制模式」，让用户知道要等。

### 实测结果（Lena 测试视频 512×512 / 2 秒）

导出文件：**H.264 / 512×512 / 60 帧 / 2.00 秒**，与源视频一致，人脸全程被遮挡。

## 为什么用 seek 逐帧而不是 play()

`play()` 受实时速度限制，1 分钟视频至少要放 1 分钟；`seek` 可以按任意速度推进，且帧序确定，便于：

- 精确的进度上报；
- 即时的取消响应；
- 确定性的输出帧序（不会因为主线程繁忙而丢帧）。

代价是 seek 本身有开销，但对离线处理场景是划算的权衡。

**检测分辨率固定 320**（design D15）：逐帧提档到 640 会让处理时间翻约 4 倍。

## 帧间追踪（`video/track.ts`）

逐帧独立检测会导致遮挡区域「忽大忽小、时有时无」。追踪器做三件事：

1. **关联合并**：本帧检测结果与上一帧轨迹按 IoU（≥0.2）+ 归一化中心距离（≤0.6 脸宽）配对；
2. **漏检补全**：配对失败的轨迹保留最多 3 帧，沿用最后位置；
3. **位置平滑**：已配对轨迹按 `smoothing=0.6` 插值，抑制抖动。

超过 3 帧仍无检测则丢弃——避免给已经离开画面的人「一直糊着一块」。

## 内存约束

- 逐帧 `VideoFrame.close()`，**绝不缓存整段视频的帧**；
- 编码队列深度超过 4 时等待（背压）；
- `encodeQueueSize` 持续监控，避免编码器积压。

实测 2 秒视频处理期间内存稳定，不随帧数线性增长。

## 取消

通过 `AbortController`：

- 每帧开始前检查 `signal.aborted`；
- 编码循环内也检查；
- 抛出 `VideoCancelled`，UI 捕获后回到可重新处理状态；
- 降级路径会同时 `recorder.cancel()` 丢弃已录内容。

实测：处理到第 5 帧时取消，1 秒内停止。

## 浏览器兼容

| 能力 | Chrome | Safari | Firefox |
|---|---|---|---|
| WebCodecs 编码 | ✅（94+） | ✅（16.4+） | ⚠️ 部分版本 |
| MediaRecorder | ✅ | ✅ | ✅ |
| H.264 编码 | ✅ | ✅ | 受限 |
| VP9 编码 | ✅ | ❌ | ✅ |

编码配置按 H.264 → VP9 顺序探测，取第一个 `isConfigSupported` 通过的。

## 已知限制

- 输出固定 30fps（浏览器不暴露源帧率；对打码场景足够）；
- **不保留音轨**：当前实现只编码视频轨，导出结果**没有声音**。
  这是已知的功能缺口：完整实现需要 `OfflineAudioContext`/`AudioDecoder` 解码原音轨 → `AudioEncoder` 重编码 → 写入同一个 muxer，工作量约等于视频轨本身。UI 目前未对此做出提示，属于待改进项（见 tasks 4.5 的偏差说明）；
- 超长视频（>10 分钟）耗时明显，UI 会提示；
- HEVC 编码的源文件在部分浏览器无法解码，会提示转码为 H.264。

## 相关文件

| 文件 | 职责 |
|---|---|
| `pipeline/import-video.ts` | 格式校验、元信息、能力探测 |
| `pipeline/video-pipeline.ts` | 主流程编排、取消、进度 |
| `pipeline/video/encode-webcodecs.ts` | WebCodecs 编码 + 容器封装 |
| `pipeline/video/encode-mediarecorder.ts` | 降级录制 |
| `pipeline/video/track.ts` | 帧间追踪 |
| `components/VideoStage.vue` | 播放器、进度、操作按钮 |

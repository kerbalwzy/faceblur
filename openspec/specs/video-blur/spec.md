# video-blur Specification

## Purpose
定义视频素材的浏览器内人脸打码闭环：本地解码、逐帧检测与遮挡绘制、处理进度与取消、以及把结果重新编码导出为可播放的视频文件。全程不经过服务端。

## Requirements

### Requirement: 视频导入与本地解码

系统 SHALL 支持导入浏览器可解码的视频文件，并在本地完成解码与逐帧处理，支持 MP4、WebM、MOV。

#### Scenario: 导入视频

- **WHEN** 用户导入一个 30 秒的 MP4 文件
- **THEN** 系统 SHALL 显示视频时长、分辨率与预计处理帧数，并允许开始处理

#### Scenario: 无法解码的容器

- **WHEN** 浏览器无法解码该视频（例如某些 HEVC 编码）
- **THEN** 系统 SHALL 给出明确提示（说明格式不受支持或浏览器缺少解码能力），并建议用户转码后重试

### Requirement: 逐帧检测与遮挡

系统 SHALL 对视频逐帧执行人脸检测并绘制遮挡，帧间结果 MUST 保持稳定；对于偶发漏检的帧，若前后帧在同一位置检测到人脸，系统 SHALL 沿用临近帧结果以避免闪烁。

#### Scenario: 快速运动镜头

- **WHEN** 视频中出现人物快速转头或进出画面的片段
- **THEN** 遮挡区域 SHALL 平滑跟随人脸，MUST NOT 出现大面积逐帧跳动

#### Scenario: 音轨保留（已知未实现）

- **WHEN** 系统导出视频时
- **THEN** 当前版本**不保留音轨**，导出结果不含声音
- **AND** 这是已记录的已知限制（见 `docs/video.md` 与 `docs/limitations.md`），
  实现路径为 `OfflineAudioContext`/`AudioDecoder` 解码原音轨 → `AudioEncoder` 重编码 → 写入同一个 muxer，
  尚未实现

### Requirement: 处理进度与取消

系统 SHALL 在处理过程中展示可量化的进度（已处理帧数 / 总帧数或百分比），并允许用户随时取消任务，取消后 MUST 释放所有中间资源并允许重新开始。

#### Scenario: 取消处理

- **WHEN** 用户在视频处理到 40% 时点击「取消」
- **THEN** 系统 SHALL 在 1 秒内停止处理、丢弃已产生的中间结果，并把界面恢复到可重新处理的状态

#### Scenario: 进度可见

- **WHEN** 视频正在处理
- **THEN** 进度条 SHALL 单调递增并在完成后到达 100%，MUST NOT 在无实际进展时持续跳动

### Requirement: 视频导出

系统 SHALL 把处理后的画面编码为可下载的视频文件，输出分辨率与源视频一致，并给出导出文件大小与格式。

#### Scenario: 导出结果可用

- **WHEN** 系统完成一个视频的处理
- **THEN** 用户 SHALL 能播放并下载导出文件，且导出视频中的人脸区域 SHALL 全程被遮挡

#### Scenario: 大文件导出

- **WHEN** 导出文件超过 500 MB
- **THEN** 系统 SHALL 提示文件体积并提供降低码率或缩短片段的选项，MUST NOT 直接无提示地吞掉失败

### Requirement: 视频处理内存约束

系统 SHALL 以流式或分块方式处理视频，MUST NOT 一次性把整段视频的全部帧保存在内存中，且 MUST 释放已消费的帧与临时 canvas。

#### Scenario: 长视频处理

- **WHEN** 用户处理一个 5 分钟、1080p 的视频
- **THEN** 浏览器内存占用 SHALL 保持相对稳定，不随已处理帧数线性增长，且页面 MUST NOT 因内存耗尽而崩溃

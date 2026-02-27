# FaceBlur
通过AI技术，快速的对视频中的人脸进行识别与模糊，保护人脸隐私安全。

### 视频演示

<iframe src="//player.bilibili.com/player.html?isOutside=true&aid=116140042946180&bvid=BV1bdAyzeEEX&cid=36315726706&p=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>

### 平台支持
- [x] Windows 11
- [x] MacOS Apple Silicon

### 快速开始
- 解释器版本: **Python 3.10.11**
  
- 依赖环境
  ```bash
  pip install -r requirements.txt
  ```
- 运行软件
  ```bash
  python app.py
  ```

### 特性
- [x] GPU加速
- [x] 人脸识别与追踪阈值可自定义调整 
- [x] 可选择需要模糊的人脸 
- [x] 处理结果即时预览

### 注意事项
- 请确保您的设备支持Python 3.10.11解释器。
- 建议在虚拟环境中安装依赖，以避免与其他项目的冲突。
  
### 为开发者

- 技术架构
  - 前端: Vue, TypeScript, Vite, Vuetify, i18n, pinia
  - 后端: Python, pywebview, av, opencv-python-headless, insightface
  - 模型: buffalo_s
  
- UI界面编译
  ```bash
  # 进入UI目录
  cd ui
  # 安装依赖
  npm install
  # 编译UI界面
  npm run build
  ```







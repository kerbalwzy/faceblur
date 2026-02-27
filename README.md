# FaceBlur
通过AI技术，快速的对视频中的人脸进行识别与模糊，保护人脸隐私安全。

### [演示视频](https://www.xiaohongshu.com/explore/69a109cd000000001d0267f5?xsec_token=ABKJW-6EW32eaJOosCXr8WYtxlGoSiljG0J3psp3J_1AM=&xsec_source=pc_user)  
### [联系作者](https://www.xiaohongshu.com/user/profile/66dfb8ec000000001d033e12)


## 平台支持
- [x] Windows 11
- [x] MacOS Apple Silicon

## 快速开始
- 解释器版本: **Python 3.10.11**
  
- 依赖环境
  ```bash
  pip install -r requirements.txt
  ```
- 运行软件
  ```bash
  python app.py
  ```

## 特性
- [x] GPU加速
- [x] 人脸识别与追踪阈值可自定义调整 
- [x] 可选择需要模糊的人脸 
- [x] 处理结果即时预览

## 注意事项
- 请确保您的设备支持Python 3.10.11解释器。
- 建议在虚拟环境中安装依赖，以避免与其他项目的冲突。
  
## 为开发者

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

## 开源协议:

本项目采用
<a href="https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode" target="_blank">CC BY-NC-SA 4.0</a>
开源协议, 您个人可以自由的使用、修改、分发本项目的源代码, 但必须保留原作者信息和使用相同的许可协议发布。禁止将本项目的内容用于商业目的, 除非您获取到我的授权。







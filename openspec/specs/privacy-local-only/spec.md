# privacy-local-only Specification

## Purpose
定义本工具最核心的产品承诺：素材与派生数据永不离开用户设备。该能力约束所有其他能力的实现方式，也是与同类在线工具的核心差异点。

## Requirements

### Requirement: 素材零上传

系统 SHALL 在浏览器本地完成素材读取、解码、人脸检测、遮挡渲染与导出，MUST NOT 将用户导入的图片、视频、逐帧画面、人脸坐标或人脸截图发送到任何服务端。

#### Scenario: 处理过程中无上传

- **WHEN** 用户导入并处理一张图片或一段视频
- **THEN** 浏览器开发者工具的网络面板中 MUST NOT 出现包含素材内容的上传请求；除站点静态资源（HTML/JS/WASM/权重/字体）外不应有业务网络请求

#### Scenario: 站点无业务后端

- **WHEN** 站点以静态文件方式托管
- **THEN** 工具的全部功能 SHALL 可用，不得依赖任何业务 API

### Requirement: 明确的隐私说明

系统 SHALL 在用户可见位置（首页与处理页）明确说明「素材不会上传、处理在本地完成」，并在站点层面提供可验证的说明（例如开源仓库链接）。

#### Scenario: 用户第一眼可见

- **WHEN** 用户首次打开站点
- **THEN** 页面上 SHALL 存在一条关于本地处理的说明文案，MUST NOT 仅在深层设置页或 FAQ 中提及

### Requirement: 无持久留存

系统 SHALL 在页面刷新或关闭后不保留用户的任何素材内容；允许持久化的数据仅限于模型权重缓存与非敏感的用户偏好设置。

#### Scenario: 刷新页面

- **WHEN** 用户处理完一张图片后刷新页面
- **THEN** 系统 SHALL 不恢复该素材，且 IndexedDB/localStorage 中 MUST NOT 存在素材像素、原始文件或人脸坐标的副本

### Requirement: 离线可用

系统 SHALL 在模型权重与静态资源加载完成后支持离线使用（例如断网后仍能处理新导入的本地图片）。

#### Scenario: 断网后处理

- **WHEN** 用户已成功使用过一次工具，随后断开网络并导入新图片
- **THEN** 系统 SHALL 仍能完成检测与导出

### Requirement: 第三方资源与许可证透明

系统 SHALL 在页脚或「关于」区域列明所用的第三方模型与代码来源及其许可证，并 SHALL 在仓库内维护 `docs/licenses.md` 作为完整清单。

#### Scenario: 许可证可见

- **WHEN** 用户查看页脚或「关于」
- **THEN** SHALL 能看到检测模型来源（YuNet / OpenCV Zoo，MIT）、推理运行时（onnxruntime-web，MIT）与前端框架等关键组件的许可证说明

#### Scenario: 商用合规

- **WHEN** 项目准备商业化上线
- **THEN** `docs/licenses.md` SHALL 覆盖全部直接与间接依赖（含模型权重、字体、图标、视频封装库），且 MUST NOT 存在任何 NC/GPL 条目

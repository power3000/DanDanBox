# Base64 编解码（Flask）

一个本地运行的 Base64 编解码小工具：Flask 后端 + 原生 JS 前端，支持文本和任意二进制文件。

## 功能

- **一次输入，两个结果**：输入任意文本，同时显示
  - 解码结果（把输入当作 Base64 解析，自动忽略空白、补齐 `=`、兼容 `-` `_` 与 `data:...;base64,` 前缀）
  - 编码结果（UTF-8 → Base64，可选 URL 安全字符、每 76 字符换行）
- **结果可回填**：一键复制，或把任一结果「填入输入」继续转换
- **二进制处理**：解码结果非 UTF-8 时显示十六进制预览，并可下载原始字节
- **文件互转**：拖拽上传文件生成 Base64；粘贴 Base64 解码下载为文件
- 深色 / 浅色主题、粘贴按钮、大小限制 32 MB

## 快速开始

**方式一：双击 `run.bat`**

- 首次运行会自动创建 `.venv` 并安装依赖
- 启动服务后自动用默认浏览器打开 <http://127.0.0.1:5000>
- 关闭那个命令行窗口即可停止服务

**方式二：手动运行**

```bash
pip install -r requirements.txt
python app.py
```

打开 <http://127.0.0.1:5000>。设置环境变量 `FLASK_DEBUG=1` 可开启调试模式。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/encode` | `{text, urlsafe?, wrap?}` → `{ok, result, length, bytes}` |
| POST | `/api/decode` | `{text}` → `{ok, result, encoding, size, sha256, hex?}` |
| POST | `/api/file/encode` | `multipart/form-data: file, urlsafe, wrap` |
| POST | `/api/file/decode` | `{text, filename}` → 文件下载 |
| GET | `/api/health` | 健康检查 |

示例：

```bash
curl -X POST http://127.0.0.1:5000/api/encode -H "Content-Type: application/json" -d "{\"text\":\"你好\"}"
curl -X POST http://127.0.0.1:5000/api/decode -H "Content-Type: application/json" -d "{\"text\":\"5L2g5aW9\"}"
```

## 测试

```bash
python -m unittest discover -s tests -v
```

## 目录结构

```
app.py               # Flask 应用与编解码逻辑
templates/index.html # 页面结构
static/style.css     # 样式（深/浅主题）
static/app.js        # 前端交互
tests/test_app.py    # 接口测试
```

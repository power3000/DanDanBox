"""Base64 编解码 Web 工具（Flask）。

运行：
    pip install -r requirements.txt
    python app.py
然后浏览器访问 http://127.0.0.1:5000
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import io
import os
import re

from flask import Flask, jsonify, render_template, request, send_file

MAX_CONTENT_LENGTH = 32 * 1024 * 1024  # 32 MiB
HEX_PREVIEW_BYTES = 4096
DATA_URL_RE = re.compile(r"^data:[^,]*;base64,", re.IGNORECASE)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH
app.json.ensure_ascii = False


# --------------------------------------------------------------------------- #
# 编解码核心逻辑
# --------------------------------------------------------------------------- #
def encode_bytes(raw: bytes, *, urlsafe: bool = False, wrap: int = 0) -> str:
    """把字节编码为 Base64 文本，wrap > 0 时按该宽度换行。"""
    encoder = base64.urlsafe_b64encode if urlsafe else base64.b64encode
    encoded = encoder(raw).decode("ascii")
    if wrap > 0:
        encoded = "\n".join(encoded[i : i + wrap] for i in range(0, len(encoded), wrap))
    return encoded


def decode_text(text: str) -> bytes:
    """解析 Base64 文本。

    兼容：空白字符、缺少的尾部 padding、URL 安全字符（- _）、data URL 前缀。
    """
    compact = DATA_URL_RE.sub("", text.strip())
    compact = re.sub(r"\s+", "", compact)
    if not compact:
        raise ValueError("内容为空，无法解码")

    compact = compact.replace("-", "+").replace("_", "/")
    compact += "=" * (-len(compact) % 4)

    try:
        return base64.b64decode(compact, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("不是合法的 Base64 字符串（包含非法字符或格式错误）") from exc


def decode_result(raw: bytes) -> dict:
    """把解码后的字节组织成便于前端展示的结果。"""
    result = {
        "ok": True,
        "size": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }
    try:
        result["encoding"] = "utf-8"
        result["result"] = raw.decode("utf-8")
    except UnicodeDecodeError:
        result["encoding"] = "binary"
        result["result"] = None
        preview = raw[:HEX_PREVIEW_BYTES].hex()
        result["hex"] = " ".join(preview[i : i + 2] for i in range(0, len(preview), 2))
        result["truncated"] = len(raw) > HEX_PREVIEW_BYTES
    return result


def fail(message: str, status: int = 400):
    return jsonify(ok=False, error=message), status


def safe_filename(name: str, fallback: str = "decoded.bin") -> str:
    name = os.path.basename(name.strip().replace("\\", "/"))
    return name or fallback


# --------------------------------------------------------------------------- #
# 页面
# --------------------------------------------------------------------------- #
@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/health")
def health():
    return jsonify(ok=True, service="base64-flask")


# --------------------------------------------------------------------------- #
# 文本接口
# --------------------------------------------------------------------------- #
@app.post("/api/encode")
def api_encode():
    payload = request.get_json(silent=True) or {}
    text = payload.get("text") or ""
    urlsafe = bool(payload.get("urlsafe"))
    wrap = 76 if payload.get("wrap") else 0

    try:
        result = encode_bytes(text.encode("utf-8"), urlsafe=urlsafe, wrap=wrap)
    except Exception:  # pragma: no cover - 防御性兜底
        return fail("编码失败，请检查输入内容")

    return jsonify(
        ok=True,
        result=result,
        length=len(result.replace("\n", "")),
        bytes=len(text.encode("utf-8")),
    )


@app.post("/api/decode")
def api_decode():
    payload = request.get_json(silent=True) or {}
    text = payload.get("text") or ""

    try:
        raw = decode_text(text)
    except ValueError as exc:
        return fail(str(exc))

    return jsonify(decode_result(raw))


# --------------------------------------------------------------------------- #
# 文件接口
# --------------------------------------------------------------------------- #
@app.post("/api/file/encode")
def api_file_encode():
    upload = request.files.get("file")
    if upload is None or not upload.filename:
        return fail("请选择要编码的文件")

    raw = upload.read()
    urlsafe = request.form.get("urlsafe") == "1"
    wrap = 76 if request.form.get("wrap") == "1" else 0

    return jsonify(
        ok=True,
        filename=upload.filename,
        size=len(raw),
        result=encode_bytes(raw, urlsafe=urlsafe, wrap=wrap),
    )


@app.post("/api/file/decode")
def api_file_decode():
    text = request.form.get("text") or ""
    filename = request.form.get("filename") or ""

    if not text:
        payload = request.get_json(silent=True) or {}
        text = payload.get("text") or ""
        filename = filename or payload.get("filename") or ""

    try:
        raw = decode_text(text)
    except ValueError as exc:
        return fail(str(exc))

    download_name = safe_filename(filename, "decoded.bin")
    return send_file(
        io.BytesIO(raw),
        as_attachment=True,
        download_name=download_name,
        mimetype="application/octet-stream",
    )


# --------------------------------------------------------------------------- #
# 错误处理
# --------------------------------------------------------------------------- #
@app.errorhandler(413)
def handle_too_large(_):
    return fail(f"请求体过大，上限为 {MAX_CONTENT_LENGTH // (1024 * 1024)} MB", 413)


@app.errorhandler(404)
def handle_not_found(_):
    if request.path.startswith("/api/"):
        return fail("接口不存在", 404)
    return render_template("index.html"), 404


@app.errorhandler(500)
def handle_server_error(_):
    if request.path.startswith("/api/"):
        return fail("服务器内部错误", 500)
    return "服务器内部错误", 500


if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG", "0").lower() in {"1", "true", "yes"}
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="127.0.0.1", port=port, debug=debug)

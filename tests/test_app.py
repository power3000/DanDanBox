"""接口冒烟测试：python -m unittest discover -s tests -v"""

import base64
import unittest

from app import app


class Base64ApiTest(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)
        self.client = app.test_client()

    # ----------------------------- 文本编码 ----------------------------- #
    def test_encode_utf8_text(self):
        res = self.client.post("/api/encode", json={"text": "你好, Base64!"})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["result"], base64.b64encode("你好, Base64!".encode()).decode())

    def test_encode_urlsafe(self):
        res = self.client.post("/api/encode", json={"text": ">>>???", "urlsafe": True})
        data = res.get_json()
        self.assertNotIn("+", data["result"])
        self.assertNotIn("/", data["result"])

    def test_encode_wrap_76(self):
        text = "a" * 200
        res = self.client.post("/api/encode", json={"text": text, "wrap": True})
        lines = res.get_json()["result"].splitlines()
        self.assertTrue(all(len(line) <= 76 for line in lines))
        self.assertGreater(len(lines), 1)

    def test_encode_empty(self):
        res = self.client.post("/api/encode", json={"text": ""})
        self.assertEqual(res.get_json()["result"], "")

    # ----------------------------- 文本解码 ----------------------------- #
    def test_decode_utf8(self):
        encoded = base64.b64encode("你好, Base64!".encode()).decode()
        res = self.client.post("/api/decode", json={"text": encoded})
        data = res.get_json()
        self.assertEqual(data["result"], "你好, Base64!")
        self.assertEqual(data["encoding"], "utf-8")

    def test_decode_tolerates_whitespace_and_missing_padding(self):
        encoded = base64.b64encode(b"hello world").decode().rstrip("=")
        messy = "  " + encoded[:4] + "\n" + encoded[4:] + "  "
        res = self.client.post("/api/decode", json={"text": messy})
        self.assertEqual(res.get_json()["result"], "hello world")

    def test_decode_urlsafe_and_data_url(self):
        encoded = base64.urlsafe_b64encode(b"\xfb\xff\xfehello").decode()
        res = self.client.post(
            "/api/decode", json={"text": "data:text/plain;base64," + encoded}
        )
        self.assertEqual(res.get_json()["size"], 8)

    def test_decode_binary_preview(self):
        encoded = base64.b64encode(bytes([0, 255, 1, 2])).decode()
        data = self.client.post("/api/decode", json={"text": encoded}).get_json()
        self.assertEqual(data["encoding"], "binary")
        self.assertIsNone(data["result"])
        self.assertTrue(data["hex"].startswith("00 ff"))

    def test_decode_invalid(self):
        res = self.client.post("/api/decode", json={"text": "not base64!!"})
        self.assertEqual(res.status_code, 400)
        self.assertFalse(res.get_json()["ok"])

    def test_decode_empty(self):
        res = self.client.post("/api/decode", json={"text": "   "})
        self.assertEqual(res.status_code, 400)

    # ------------------------------ 文件 ------------------------------- #
    def test_file_encode_and_decode_roundtrip(self):
        raw = b"\x00\x01binary\xff data"
        upload = (self.client.post(
            "/api/file/encode",
            data={"file": (__import__("io").BytesIO(raw), "demo.bin")},
            content_type="multipart/form-data",
        )).get_json()
        self.assertTrue(upload["ok"])
        self.assertEqual(upload["size"], len(raw))

        res = self.client.post(
            "/api/file/decode",
            json={"text": upload["result"], "filename": "../evil.bin"},
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data, raw)
        self.assertIn("evil.bin", res.headers["Content-Disposition"])
        self.assertNotIn("..", res.headers["Content-Disposition"])

    def test_health(self):
        self.assertEqual(self.client.get("/api/health").get_json()["ok"], True)

    def test_index(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertIn(b"Base64", res.data)


if __name__ == "__main__":
    unittest.main()

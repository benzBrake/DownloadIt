import http.client
from html.parser import HTMLParser
from io import BytesIO
import threading
import time
import unittest
from urllib.parse import unquote_to_bytes
import zipfile

from server import FIXTURES, Handler, SERVICE_ID, ThreadingHTTPServer


class QuietHandler(Handler):
    def log_message(self, *_args):
        pass


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            attrs = dict(attrs)
            assert "download" not in attrs
            self.links.append(attrs["href"])


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, path, method="GET", headers=None):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        try:
            connection.request(method, path, headers=headers or {})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_homepage_and_health(self):
        status, headers, body = self.request("/")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "text/html; charset=utf-8")
        parser = Links()
        parser.feed(body.decode("utf-8"))
        self.assertEqual(set(parser.links), set(FIXTURES) | {"/redirect"})
        self.assertEqual(self.request("/health")[2].decode(), SERVICE_ID)
        self.assertEqual(self.request("/missing")[0], 404)

    def test_encoding_fixtures(self):
        for fixture in FIXTURES.values():
            if not fixture.path.startswith("/encoding/"):
                continue
            with self.subTest(path=fixture.path):
                raw = unquote_to_bytes(fixture.path.rsplit("/", 1)[1])
                self.assertEqual(raw, fixture.filename.encode(fixture.encoding))
                self.assertEqual(fixture.path.rsplit("/", 1)[1], "".join(f"%{byte:02X}" for byte in raw))
                status, headers, body = self.request(fixture.path)
                self.assertEqual(status, 200)
                self.assertEqual(headers["Content-Type"], "application/octet-stream")
                self.assertEqual(headers["Content-Disposition"], "attachment")
                self.assertEqual(body, fixture.body)
                self.assertEqual(int(headers["Content-Length"]), len(body))

    def test_zip_and_redirect(self):
        status, headers, _ = self.request("/redirect")
        self.assertEqual(status, 302)
        self.assertEqual(headers["Location"], "/files/archive.zip")
        for fixture in FIXTURES.values():
            if fixture.filename.endswith(".zip"):
                with zipfile.ZipFile(BytesIO(self.request(fixture.path)[2])) as archive:
                    self.assertIsNone(archive.testzip())
                    self.assertEqual(archive.read("readme.txt"), b"DownloadIt ZIP fixture\n")

    def test_head_and_ranges(self):
        for fixture in FIXTURES.values():
            with self.subTest(path=fixture.path):
                status, headers, body = self.request(fixture.path, "HEAD", {"Range": "bytes=1-3"})
                self.assertEqual(status, 200)
                self.assertEqual(body, b"")
                self.assertEqual(int(headers["Content-Length"]), fixture.length)
                self.assertEqual(headers["Accept-Ranges"], "bytes")
                for value, start, end in [("bytes=1-3", 1, 3), ("bytes=-4", fixture.length - 4, fixture.length - 1),
                                          (f"bytes={fixture.length - 4}-", fixture.length - 4, fixture.length - 1),
                                          (f"bytes={fixture.length - 4}-999999999", fixture.length - 4, fixture.length - 1)]:
                    status, headers, body = self.request(fixture.path, headers={"Range": value})
                    self.assertEqual(status, 206)
                    self.assertEqual(headers["Content-Range"], f"bytes {start}-{end}/{fixture.length}")
                    self.assertEqual(body, bytes(fixture.body[i % len(fixture.body)] for i in range(start, end + 1)))
                    self.assertEqual(int(headers["Content-Length"]), len(body))
                for value in ["bytes=999999999-", "bytes=5-2", "bytes=-0", "bytes=-", "bytes=0-1,3-4", "garbage"]:
                    status, headers, body = self.request(fixture.path, headers={"Range": value})
                    self.assertEqual(status, 416)
                    self.assertEqual(headers["Content-Range"], f"bytes */{fixture.length}")
                    self.assertEqual(body, b"")

    def test_large_payload_and_slow_rate(self):
        status, headers, body = self.request("/files/large.bin")
        self.assertEqual(status, 200)
        self.assertEqual(len(body), 32 * 1024**2)
        self.assertEqual(int(headers["Content-Length"]), len(body))
        self.assertEqual(body, FIXTURES["/files/large.bin"].body * 512)
        started = time.monotonic()
        status, _, body = self.request("/files/slow.bin", headers={"Range": "bytes=0-131071"})
        self.assertEqual(status, 206)
        self.assertEqual(len(body), 131072)
        self.assertGreaterEqual(time.monotonic() - started, 0.45)


if __name__ == "__main__":
    unittest.main()

"""DownloadIt manual download fixtures; Python standard library only."""

import argparse
from dataclasses import dataclass
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
import re
import time
from urllib.parse import urlsplit
import zipfile


SERVICE_ID = "downloadit-test-server-v1"
BLOCK = bytes(range(256)) * 256


@dataclass(frozen=True)
class Fixture:
    path: str
    filename: str
    encoding: str
    note: str
    body: bytes = BLOCK
    size: int = 0
    slow: bool = False
    mime: str = "application/octet-stream"

    @property
    def length(self):
        return self.size or len(self.body)


def make_fixtures():
    archive = BytesIO()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as output:
        output.writestr("readme.txt", "DownloadIt ZIP fixture\n")
    fixtures = [
        Fixture("/files/plain.txt", "plain.txt", "ASCII", "普通文本下载", b"DownloadIt text fixture\n", mime="text/plain"),
        Fixture("/files/archive.zip", "archive.zip", "ASCII", "有效 ZIP，可解压校验", archive.getvalue(), mime="application/zip"),
        Fixture("/files/large.bin", "large.bin", "ASCII", "32 MiB，支持断点续传", size=32 * 1024**2),
        Fixture("/files/slow.bin", "slow.bin", "ASCII", "32 MiB，约 256 KiB/s，可测试取消和续传", size=32 * 1024**2, slow=True),
    ]
    for encoding, names in [
        ("GB18030", ["中文下载测试.txt", "简体资料文件.zip"]),
        ("Big5", ["繁體中文下載.txt", "測試資料檔案.zip"]),
        ("Shift_JIS", ["日本語ダウンロード.txt", "テスト資料ファイル.zip"]),
        ("UTF-8", ["中文繁體日本語.txt"]),
        ("ASCII", ["encoding-control.txt"]),
    ]:
        for name in names:
            body = archive.getvalue() if name.endswith(".zip") else b"DownloadIt filename encoding fixture\n"
            # Escape even ASCII-valued trail bytes: splitting a Big5/Shift_JIS
            # character into separate escaped and literal runs breaks detection.
            encoded_name = "".join(f"%{byte:02X}" for byte in name.encode(encoding))
            path = "/encoding/" + encoding.lower() + "/" + encoded_name
            fixtures.append(Fixture(path, name, encoding, "仅从 URL 猜测文件名；响应不声明编码或文件名", body))
    return {fixture.path: fixture for fixture in fixtures}


FIXTURES = make_fixtures()


def homepage():
    sections = []
    for title, prefix in [("常用下载", "/files/"), ("传统编码与对照", "/encoding/")]:
        rows = []
        for fixture in FIXTURES.values():
            if fixture.path.startswith(prefix):
                rows.append(f'<tr><td><a href="{escape(fixture.path, quote=True)}">{escape(fixture.filename)}</a></td>'
                            f'<td>{escape(fixture.encoding)}</td><td>{fixture.length:,} 字节</td><td>{escape(fixture.note)}</td></tr>')
        if prefix == "/files/":
            rows.append('<tr><td><a href="/redirect">302 跳转下载</a></td><td>ASCII</td><td>同 archive.zip</td><td>跳转到有效 ZIP；预期文件名 archive.zip</td></tr>')
        sections.append(f"<h2>{title}</h2><table><thead><tr><th>下载链接 / 预期文件名</th><th>文件名编码</th><th>大小</th><th>验证要点</th></tr></thead><tbody>{''.join(rows)}</tbody></table>")
    return ('''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>DownloadIt 下载测试</title><style>body{font:16px system-ui;max-width:1200px;margin:40px auto;padding:0 20px;line-height:1.6}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:10px;text-align:left}a{color:#1764bc}th{background:#eee}code{overflow-wrap:anywhere}</style>
<h1>DownloadIt 下载测试</h1><p>点击链接测试下载弹窗，也可选中多个链接测试批量收集。表中名称即预期保存的文件名。</p>
<p>编码测试：开启 DownloadIt 的“检测 URL 文件名编码”，观察下载弹窗中的文件名。若自动猜测不正确，在“文件名编码”下拉框选择对应的 GB18030、Big5 或 Shift_JIS 候选，并与表中名称比较。传统编码可能存在歧义，自动猜测不保证唯一正确。</p>
<p>编码样例的 URL 使用传统编码字节的百分号转义。下载响应不提供 charset、filename 或 filename*；首页自身使用 UTF-8。文本内容仅为测试载荷，不用于判断文件名编码。</p>
''' + "".join(sections) + "</html>").encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    def do_HEAD(self):
        self.respond(head=True)

    def do_GET(self):
        self.respond(head=False)

    def small_response(self, status, body, mime, head, **headers):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        for name, value in headers.items():
            self.send_header(name.replace("_", "-"), value)
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def respond(self, head):
        try:
            self.route(head)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # Cancellation is an expected test action.

    def route(self, head):
        path = urlsplit(self.path).path
        if path == "/health":
            self.small_response(200, SERVICE_ID.encode("ascii"), "text/plain", head)
            return
        if path == "/":
            self.small_response(200, homepage(), "text/html; charset=utf-8", head)
            return
        if path == "/redirect":
            self.small_response(302, b"", "text/plain", head, Location="/files/archive.zip")
            return
        fixture = FIXTURES.get(path)
        if fixture is None:
            self.small_response(404, b"Not found\n", "text/plain", head)
            return
        start, end = 0, fixture.length - 1
        # RFC Range applies to GET; HEAD describes the full representation.
        range_header = None if head else self.headers.get("Range")
        if range_header:
            match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header)
            valid = bool(match and any(match.groups()))
            if valid:
                first, last = match.groups()
                if first:
                    start = int(first)
                    end = min(int(last), end) if last else end
                else:
                    count = int(last)
                    start = max(0, fixture.length - count)
                    valid = count > 0
                valid = valid and start <= end and start < fixture.length
            if not valid:
                self.small_response(416, b"", fixture.mime, head, Content_Range=f"bytes */{fixture.length}")
                return
        self.send_response(206 if range_header else 200)
        self.send_header("Content-Type", fixture.mime)
        self.send_header("Content-Disposition", "attachment")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        if range_header:
            self.send_header("Content-Range", f"bytes {start}-{end}/{fixture.length}")
        self.end_headers()
        if head:
            return
        position = start
        while position <= end:
            count = min(65536, end - position + 1)
            offset = position % len(fixture.body)
            chunk = (fixture.body * ((offset + count) // len(fixture.body) + 1))[offset:offset + count]
            if fixture.slow:
                time.sleep(count / (256 * 1024))
            self.wfile.write(chunk)
            self.wfile.flush()
            position += count


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    with ThreadingHTTPServer((args.host, args.port), Handler) as server:
        print(f"DownloadIt test server listening on {args.host}:{args.port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass

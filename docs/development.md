# Development

[简体中文](development-zh_CN.md) · [Project overview](../README.md)

## Build and test

Run from the repository root. Windows builds use PowerShell 7:

```powershell
pwsh -ExecutionPolicy Bypass -File .\scripts\pack.ps1
```

Linux builds use Bash, curl, zip/unzip, and GNU core utilities; fetching a missing FlashGot helper also requires jq:

```bash
./scripts/pack.sh
```

Both scripts produce a universal `addon.xpi` for Windows and Linux. Missing bundled helpers and frontend assets are fetched from upstream releases and verified before packaging. Build artifacts and downloaded assets are excluded from version control. Dependency versions and verification metadata are maintained in the packaging scripts.

Tests use Node.js 18 or later and its built-in test runner:

```sh
node --test tests/*.test.mjs
```

## Local download test server

With WSLC installed and configured, run from CMD or PowerShell:

```powershell
.\scripts\DownloadTestServer.cmd start
# Optional port; leave the browser closed:
.\scripts\DownloadTestServer.cmd start -Port 8766 -NoOpen
# Stop the selected instance:
.\scripts\DownloadTestServer.cmd stop -Port 8766
```

Double-click `scripts/DownloadTestServer.cmd` to start with defaults; omitting the action means `start`. The wrapper prefers PowerShell 7 and falls back to Windows PowerShell, bypassing execution policy only for its process. The `.ps1` entry also accepts `start`/`stop`, `-Port`, and `-NoOpen`. Stopping an absent instance succeeds without changing anything.

The first run pulls `python:3.13-slim`. The script mounts only `scripts/download-test-server/` read-only, starts a background container, waits for readiness, then opens `http://localhost:8765/`. Only the Windows loopback address is published. A matching healthy container is reused; conflicting containers or occupied ports produce an error without replacing another service. Stop the default instance with `.\scripts\DownloadTestServer.cmd stop`; the container is removed automatically. Run again after editing the service code.

The page provides text, valid ZIP, 302 redirect, and 32 MiB normal/slow downloads with HEAD and single-range resume support. The slow endpoint runs at approximately 256 KiB/s. Files are generated in memory, without large files on disk. Select multiple links to test batch collection.

Filename cases include two samples each for simplified Chinese GB18030, traditional Chinese Big5, and Japanese Shift_JIS, plus ASCII and UTF-8 controls. The URL contains percent-escaped bytes in that encoding. Encoding downloads return `application/octet-stream` and `Content-Disposition: attachment`, without `charset`, `filename`, or `filename*`. Enable **Detect URL filename encoding** in DownloadIt, compare the dialog with the expected name on the page, and use the filename-encoding menu to select another candidate when needed. Legacy encodings can be ambiguous; an automatic guess is not guaranteed to be correct. Payload text does not determine filename encoding. The standalone test page uses Simplified Chinese and is separate from extension runtime localization.

Run protocol tests using the same Python image (or use local Python 3.13 with the same unittest command):

```powershell
wslc run --rm --volume "${PWD}/scripts/download-test-server:/app:ro" --workdir /app python:3.13-slim python -B -m unittest -v test_server
```

## Code layout

`addon/bootstrap.js` handles the extension lifecycle. Modules in `addon/chrome/content/` implement downloader integrations, link collection, automatic capture, native Firefox UI integration, and settings. Runtime UI text uses Firefox's built-in Fluent system, with matching message IDs under `locales/{en-US,ja,zh-CN,zh-TW}/downloadit.ftl`.

Use Firefox's internal APIs rather than Loader utilities. The Loader is a startup dependency, not an implementation API.

## Versions and distribution

`addon/install.rdf` is the single source of truth for the XPI version. DownloadIt has its own version line starting at `2.0.0`, separate from FlashGot and its helper. Use three numeric components: major for incompatible changes, minor for compatible features, and patch for compatible fixes. Never reset a published version.

The nightly workflow publishes `addon.xpi` and generates the legacy `update.rdf` from the manifest. Current supported Loaders do not perform automatic updates; users install upgrades manually.

For installation and configuration, see the [user documentation](https://benzbrake.github.io/DownloadIt/). Bundled component sources and licenses are listed in [third-party notices](../addon/THIRD_PARTY_NOTICES.txt).

Encoding detector dependency: jschardet 4.1.0 (0BSD), https://registry.npmjs.org/jschardet/-/jschardet-4.1.0.tgz

SHA-512 (base64): `ighRZ11mb6l4m+xSKoivuqNj44qkObODXsAnnkkfYcY4JfYRnEgAe/w1c3mbnJtTQmLtfebAUfXGsUGUJImexg==`.

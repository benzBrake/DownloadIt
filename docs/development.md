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

## Code layout

`addon/bootstrap.js` handles the extension lifecycle. Modules in `addon/chrome/content/` implement downloader integrations, link collection, automatic capture, native Firefox UI integration, and settings. Runtime UI text uses Firefox's built-in Fluent system, with matching message IDs under `locales/{en-US,ja,zh-CN,zh-TW}/downloadit.ftl`.

Use Firefox's internal APIs rather than Loader utilities. The Loader is a startup dependency, not an implementation API.

## Versions and distribution

`addon/install.rdf` is the single source of truth for the XPI version. DownloadIt has its own version line starting at `2.0.0`, separate from FlashGot and its helper. Use three numeric components: major for incompatible changes, minor for compatible features, and patch for compatible fixes. Never reset a published version.

The nightly workflow publishes `addon.xpi` and generates the legacy `update.rdf` from the manifest. Current supported Loaders do not perform automatic updates; users install upgrades manually.

For installation and configuration, see the [user documentation](https://benzbrake.github.io/DownloadIt/). Bundled component sources and licenses are listed in [third-party notices](../addon/THIRD_PARTY_NOTICES.txt).

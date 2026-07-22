# DownloadIt

[![Nightly build](https://img.shields.io/badge/nightly-download-blue?logo=firefox)](https://nightly.link/benzBrake/DownloadIt/workflows/nightly/master/DownloadIt-nightly.zip)

DownloadIt is a port of FlashGot's download-bridge extension for modern Firefox. It uses a customized [`userChrome.js-Loader`](https://github.com/benzBrake/userChrome.js-Loader) to load a bootstrapped XPI and forward web links to an external download manager.

The project is currently being migrated. Its target platform is Windows, and the minimum supported Firefox version is 136.0.

## Current features

- Adds a DownloadIt item to the context menu for web links.
- Adds a Downloadit Selection item below it when selected page content contains links.
- Detects download managers supported by `FlashGot.exe` and lets you choose a default tool.
- Embeds a DownloadIt choice in Firefox's native download prompt for supported downloads.
- Supports `http`, `https`, `ftp`, and `magnet` links.
- Passes the URL, filename, referrer, cookies, and User-Agent to the download tool.
- Provides Firefox settings for the default download manager and cookie-forwarding policy.
- Supports Simplified Chinese and English in the UI and context menu.
- Stores UI messages in Firefox's built-in Fluent resources.
- Verifies the bundled `FlashGot.exe` during the build and at runtime.

The following features are not implemented yet:

- Downloading all links;
- Unknown file-type interception;
- Media sniffing;
- The complete original FlashGot options page and other advanced features.

## How it works

```text
Firefox context menu or native download prompt
        │
        ▼
DownloadIt background service
        │  Temporary JSON file
        ▼
FlashGot.exe
        │
        ▼
External download manager
```

When the extension starts, it deploys `FlashGot.exe` from the XPI to `DownloadIt\FlashGot.exe` under the Firefox profile, then communicates with it through these command-line interfaces:

- `--list-json`: detects available download managers;
- `--job-json`: submits a single- or multi-link download task.

## Prerequisites

- Windows;
- Firefox 136.0 or later;
- A configured custom `userChrome.js-Loader` that is active in the target profile. The version released after 20250219 is recommended because it supports Firefox 135+;
- At least one download manager supported by `FlashGot.exe`;
- If `addon/FlashGot.exe` is missing during the build, the script automatically downloads it from the [Grabby-FlashGot](https://github.com/benzBrake/Grabby-FlashGot) nightly build. This binary is excluded by `.gitignore` and is not committed to the Git repository. During packaging, the actual file size and SHA-256 hash are written to generated metadata inside the XPI and used for runtime verification;
- Node.js 18 or later for development and testing;
- PowerShell 7 (`pwsh`) for building.

## Build

Run the following command from the repository root:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\pack.ps1
```

The script packages `addon/` into `addon.xpi` in the repository root and verifies that the XPI contains at least:

- `bootstrap.js`;
- `install.rdf`;
- `chrome.manifest`;
- `FlashGot.exe`.

`addon.xpi` is a build artifact and is ignored by `.gitignore` by default. `addon/FlashGot.exe` is also excluded from version control; when it is missing, `pack.ps1` automatically fetches the latest nightly build.

## Testing

Tests use Node.js's built-in test runner:

```powershell
node --test .\tests\*.test.mjs
```

The test suite covers single- and multi-link download-task JSON, URL and filename validation, selection-link extraction, download-manager parsing, the context-menu insertion point, the native download prompt integration, and the basic structure of the settings page.

## Installation and upgrade

1. Install `userChrome.js-Loader` and confirm that it is active in the target Firefox profile.
2. Run the build command to generate `addon.xpi`.
3. In Firefox, open `about:addons`, choose “Install Add-on From File…” from the gear menu, and select `addon.xpi`.
4. Restart Firefox so that the extension and context menus can finish initializing.

To upgrade, install the newly built `addon.xpi` over the existing installation. If the extension does not start, first check the Loader version, Firefox version, and profile, then check the extension status in `about:addons`.

## Configuration

Open the settings page from “DownloadIt Settings” in the context menu or from the extension settings in `about:addons`.

| Preference | Type | Description |
| --- | --- | --- |
| `downloadit.defaultDM` | String | Name of the default download manager. The name must come from the most recent detection result. |
| `downloadit.omitCookies` | Boolean | When `true`, cookies are not sent to the external download tool. The default is `false`. |
| `downloadit.detectedManagers` | String | Cached download-manager detection results, maintained automatically by the extension. |

When a preference is locked by Firefox policy, the settings page displays its locked state and prevents changes.

## Project structure

```text
addon/
├── bootstrap.js                         # Extension lifecycle entry point
├── install.rdf                           # Bootstrapped XPI metadata
├── chrome.manifest                       # chrome://downloadit registration
├── FlashGot.exe                          # Download-manager bridge
└── chrome/content/
    ├── DownloadItService.sys.mjs        # Service, process, and preference management
    ├── DownloadItContextMenu.sys.mjs    # Firefox context menu
    ├── DownloadItDownloadDialog.sys.mjs # Firefox native download prompt integration
    ├── DownloadItSelectionActor.sys.mjs # Selection link extraction Actor
    ├── DownloadItLocalization.sys.mjs   # Firefox Fluent resource registration
    ├── DownloadItProtocol.sys.mjs       # Download-task protocol and validation
    ├── DownloadItUtils.sys.mjs           # Request encoding, domain, and cookie helpers
    ├── locales/
    │   ├── en-US/downloadit.ftl          # English Fluent messages
    │   └── zh-CN/downloadit.ftl          # Simplified Chinese Fluent messages
    ├── options.xhtml                     # Settings page structure
    ├── options.js                        # Settings page logic
    └── options.css                       # Settings page styles
pack.ps1                                  # XPI packaging script
tests/                                    # Node.js unit tests
```

## License and third-party components

DownloadIt is an unofficial modern port based on the original FlashGot extension. FlashGot was created by Giorgio Maone and is licensed under GPL-2.0-or-later. See [`addon/THIRD_PARTY_NOTICES.txt`](addon/THIRD_PARTY_NOTICES.txt) for related notices.

The bundled `FlashGot.exe` is based on [Grabby-FlashGot](https://github.com/benzBrake/Grabby-FlashGot) and is licensed under GPL-3.0. Each XPI contains `chrome/content/DownloadItBinaryMetadata.sys.mjs`, whose metadata matches the bundled binary and is used for runtime integrity verification.

For the Chinese version, see [README-zh_CN.md](README-zh_CN.md).

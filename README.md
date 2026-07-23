# DownloadIt

[![Nightly build](https://img.shields.io/badge/nightly-download-blue?logo=firefox)](https://nightly.link/benzBrake/DownloadIt/workflows/nightly/master/DownloadIt-nightly.zip)

DownloadIt is a port of FlashGot's download-bridge extension for modern Firefox. It uses a customized [`userChrome.js-Loader`](https://github.com/benzBrake/userChrome.js-Loader) to load a bootstrapped XPI and forward web links to an external download manager.

The project is currently being migrated. Its target platform is Windows, and the minimum supported Firefox version is 136.0.

## Current features

- Adds a DownloadIt item to the context menu for web links.
- Adds a Downloadit Selection item below it when selected page content contains links.
- Detects download managers supported by `FlashGot.exe` and lets you choose a default tool.
- Supports custom command-line downloaders and aria2 JSON-RPC without routing them through `FlashGot.exe`.
- Embeds a DownloadIt choice in Firefox's native download prompt for supported downloads.
- Lets you remember supported file extensions and automatically forward them to the current default manager.
- Supports `http`, `https`, `ftp`, and `magnet` links.
- Passes the URL, filename, referrer, cookies, and User-Agent to the download tool.
- Provides Firefox settings for the default download manager and cookie-forwarding policy.
- Provides a settings list for remembered automatic file extensions.
- Supports Simplified Chinese and English in the UI and context menu.
- Stores UI messages in Firefox's built-in Fluent resources.
- Verifies the bundled `FlashGot.exe` during the build and at runtime.

The following features are not implemented yet:

- Downloading all links;
- Broad unknown file-type interception;
- Media sniffing;
- The complete original FlashGot options page and other advanced features.

## How it works

```text
Firefox context menu, native download prompt, or remembered extension hook
        │
        ▼
DownloadIt background service
        │
        ├── flashgot provider ── temporary job JSON ── FlashGot.exe
        ├── custom command provider ── native Firefox process API
        └── custom aria2 provider ── JSON-RPC
```

When the extension starts, it deploys `FlashGot.exe` from the XPI to `DownloadIt\FlashGot.exe` under the Firefox profile, then communicates with it through these command-line interfaces:

- `--list-json`: detects available download managers;
- `--job-json`: submits a single- or multi-link download task.

## Prerequisites

- Windows;
- Firefox 136.0 or later;
- A configured custom `userChrome.js-Loader` that is active in the target profile. The version released after 20250219 is recommended because it supports Firefox 135+;
- At least one download manager supported by `FlashGot.exe`, or a configured custom downloader;
- If `addon/FlashGot.exe` is missing during the build, the PowerShell script downloads it from the [Grabby-FlashGot](https://github.com/benzBrake/Grabby-FlashGot) nightly build, while the Linux script parses the latest GitHub Release page and downloads the published `FlashGot-v*.zip` asset without using the GitHub API. If no formal release exists, provide `addon/FlashGot.exe` locally before using the Linux script. This binary is excluded by `.gitignore` and is not committed to the Git repository. During packaging, the actual file size and SHA-256 hash are written to generated metadata inside the XPI and used for runtime verification;
- Node.js 18 or later for development and testing;
- PowerShell 7 (`pwsh`) for building on Windows;
- Bash, `curl`, `zip`, `unzip`, `sha256sum`, and GNU core utilities for building on Linux.

## Build

Run the command for your platform from the repository root.

Windows:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\pack.ps1
```

Linux:

```bash
./pack.sh
```

The script packages `addon/` into `addon.xpi` in the repository root and verifies that the XPI contains at least:

- `bootstrap.js`;
- `install.rdf`;
- `chrome.manifest`;
- `FlashGot.exe`.

`addon.xpi` is a build artifact and is ignored by `.gitignore` by default. `addon/FlashGot.exe` is also excluded from version control. When it is missing, `pack.ps1` fetches the latest nightly build, while `pack.sh` parses the latest formal Release page and downloads its matching archive without calling the GitHub API. If the upstream project has no formal release, place `FlashGot.exe` in `addon/` before running `pack.sh`.

## Testing

Tests use Node.js's built-in test runner:

```powershell
node --test .\tests\*.test.mjs
```

The test suite covers single- and multi-link download-task JSON, URL and filename validation, selection-link extraction, download-manager parsing, the toolbar PanelView and context-menu insertion point, remembered-extension interception and fallback, the native download prompt integration, Fluent resources, and the staged settings page structure.

## Installation and upgrade

1. Install `userChrome.js-Loader` and confirm that it is active in the target Firefox profile.
2. Run the build command to generate `addon.xpi`.
3. In Firefox, open `about:addons`, choose “Install Add-on From File…” from the gear menu, and select `addon.xpi`.
4. Restart Firefox so that the extension and context menus can finish initializing.

To upgrade, install the newly built `addon.xpi` over the existing installation. If the extension does not start, first check the Loader version, Firefox version, and profile, then check the extension status in `about:addons`.

## Configuration

The DownloadIt toolbar button opens a native Firefox panel. Select an available tool to change the default download manager immediately, use “Detect download managers again” to refresh the detected-tool list, or open DownloadIt settings from the panel footer. The button is added to the navigation bar initially and can be moved or removed through Firefox's Customize Toolbar interface.

Open the settings page from the toolbar panel, from “DownloadIt Settings” in the context menu, or from the extension settings in `about:addons`.

| Preference | Type | Description |
| --- | --- | --- |
| `downloadit.defaultDM` | String | JSON downloader reference such as `{"provider":"flashgot","id":"Internet Download Manager"}` or `{"provider":"custom","id":"<uuid>"}`. Legacy FlashGot names are migrated automatically. |
| `downloadit.omitCookies` | Boolean | When `true`, cookies are not sent to the external download tool. The default is `false`. |
| `downloadit.detectedManagers` | String | Cached download-manager detection results, maintained automatically by the extension. |
| `downloadit.autoExtensions` | String | JSON array of file extensions that should be sent to the current default manager automatically. |

When a preference is locked by Firefox policy, the settings page displays its locked state and prevents changes. Remembered extensions can be removed individually or cleared from the settings page.

Only explicitly remembered extensions are intercepted. Empty extensions, Firefox install packages (`.xpi`/`xpinstall`), and unsupported URL schemes always remain in Firefox's native flow. Executable extensions such as `.exe` can be remembered explicitly.

### Custom downloaders

Custom definitions are stored as formatted UTF-8 JSON in `DownloadIt\custom-downloaders.json` under the Firefox profile. The file is loaded at startup and can be reloaded from the settings page. Invalid JSON and unsupported versions are preserved without being overwritten; use the explicit reset action to replace a damaged file with an empty configuration.

The file is created when custom definitions are first applied and uses stable, non-editable UUIDs:

```json
{
  "version": 1,
  "downloaders": [
    {
      "id": "123e4567-e89b-42d3-a456-426614174000",
      "name": "My downloader",
      "enabled": true,
      "type": "command",
      "startHidden": true,
      "command": {
        "executablePath": "C:\\Tools\\downloader.exe",
        "argumentsTemplate": "[URL]"
      }
    }
  ]
}
```

Executable and aria2 configuration paths inside Firefox's chrome configuration directory (`UChrm`, normally `<profile>/chrome`) are stored with forward slashes relative to that directory, for example `UserTools/aria2/aria2c.exe` and `UserTools/aria2/aria2.conf`. Relative paths are always resolved from `UChrm`; files outside it keep their absolute paths.

Custom downloaders hide process windows by default. Clear **Hide process window** to run command-line processes, or an automatically started aria2c process, in the foreground for debugging. Existing JSON files without `startHidden` retain hidden execution.

Command-line downloaders select an executable and an arguments template. The editor provides quick templates for `aria2c`, `wget`, and `curl`. DownloadIt invokes the executable directly with Firefox's native process API and never passes the template through a command shell. Supported FlashGot-compatible placeholders are `URL`, `FNAME`, `COMMENT`, `REFERER`, `COOKIE`, `CFILE`, `FOLDER`, `POST`, `RAWPOST`, `HEADERS`, `ULIST`, `UFILE`, `USERPASS`, and `UA`. A template containing `ULIST` or `UFILE` starts one process for the batch; otherwise one process is started per link.

aria2 definitions connect to an HTTP or HTTPS JSON-RPC endpoint and support an optional secret and server-side download directory. Multiple links are submitted with `system.multicall`. The optional local-startup settings include `executablePath` and `configurationPath`; the executable becomes required only when automatic startup is enabled, while the configuration file may remain empty. When supplied, DownloadIt passes the resolved configuration file as `--conf-path`. Optional aria2c startup is restricted to HTTP loopback endpoints; DownloadIt controls the configuration path, RPC enablement, listen address, port, and secret arguments, waits up to five seconds for readiness, and retries the request once. RPC secrets are stored as plain text in the JSON file and are never written to DownloadIt logs.

The provider registry also reserves the `native` namespace for future JavaScript-based detection and invocation without `FlashGot.exe`.

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
    ├── DownloadItDownloaders.sys.mjs    # Provider references, custom schema, templates, and aria2 protocol
    ├── DownloadItXUL.sys.mjs             # Shared Firefox XUL element construction helper
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
pack.sh                                   # Linux XPI packaging script
tests/                                    # Node.js unit tests
```

## License and third-party components

DownloadIt is an unofficial modern port based on the original FlashGot extension. FlashGot was created by Giorgio Maone and is licensed under GPL-2.0-or-later. See [`addon/THIRD_PARTY_NOTICES.txt`](addon/THIRD_PARTY_NOTICES.txt) for related notices.

The bundled `FlashGot.exe` is based on [Grabby-FlashGot](https://github.com/benzBrake/Grabby-FlashGot) and is licensed under GPL-3.0. Each XPI contains `chrome/content/DownloadItBinaryMetadata.sys.mjs`, whose metadata matches the bundled binary and is used for runtime integrity verification.

For the Chinese version, see [README-zh_CN.md](README-zh_CN.md).

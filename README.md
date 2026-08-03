# DownloadIt

<img src="addon/chrome/content/icons/downloadit.svg" alt="DownloadIt icon" width="128">

[![Nightly build](https://img.shields.io/badge/nightly-download-blue?logo=firefox)](https://nightly.link/benzBrake/DownloadIt/workflows/nightly/master/DownloadIt-nightly.zip)

DownloadIt is a port of FlashGot's download-bridge extension for modern Firefox. It uses a customized [`userChrome.js-Loader`](https://github.com/benzBrake/userChrome.js-Loader) to load a bootstrapped XPI and forward web links to an external download manager.

The project is currently being migrated. It supports Windows and Linux, and the minimum supported Firefox version is 136.0.

## Current features

- Adds a DownloadIt item to the context menu for web links.
- Adds a Downloadit Selection item below it when selected page content contains links.
- Adds a DownloadIt Links selector for collecting, filtering, and batch-downloading explicit page links from the current document and its frames.
- On Windows, detects download managers supported by `FlashGot.exe` and lets you choose a default tool.
- Shows POST, cookie, batch, download-directory, and task-start capabilities for each downloader.
- Provides an always-available Firefox downloader without routing requests through `FlashGot.exe`.
- Supports JDownloader directly through its loopback FlashGot endpoint without routing requests through `FlashGot.exe`.
- Supports AB Download Manager directly through its loopback HTTP API without routing requests through `FlashGot.exe`.
- Supports Xtreme Download Manager directly through its built-in loopback API without routing requests through `FlashGot.exe`.
- Supports uGet directly through its cross-platform quiet command-line interface without routing requests through `FlashGot.exe`.
- Supports custom command-line downloaders and aria2 JSON-RPC without routing them through `FlashGot.exe`.
- Optionally redirects compatible IDM local HTTP requests from extensions such as [hmjz100/LinkSwift](https://github.com/hmjz100/LinkSwift) to the current default downloader.
- Embeds a DownloadIt choice in Firefox's native download prompt for supported downloads.
- Provides allow and deny lists for automatic file-type capture, with deny rules taking priority.
- Supports `http`, `https`, `ftp`, and `magnet` links.
- Passes the URL, filename, referrer, cookies, and User-Agent to external download tools; the Firefox downloader uses the native browsing and cookie context.
- Provides Firefox settings for the default download manager, task-start behavior, and cookie-forwarding policy.
- Provides a dedicated **Auto-capture** settings tab for editing allow and deny rules and reviewing built-in protections.
- Provides an optional GitHub mirror adapter with a configurable endpoint and a registry designed for additional sites such as Hugging Face.
- Supports Simplified Chinese and English in the UI and context menu.
- Stores UI messages in Firefox's built-in Fluent resources.
- Verifies the bundled `FlashGot.exe` during the build and at Windows runtime.

The following features are not implemented yet:

- Broad unknown file-type interception;
- Media sniffing;
- The complete original FlashGot options page and other advanced features.

## How it works

```text
Firefox context menu, native download prompt, remembered extension hook,
or an enabled IDM local protocol hook
        │
        ▼
DownloadIt background service
        │
        ├── native provider ── Firefox Downloads API
        ├── flashgot provider (Windows) ── temporary job JSON ── FlashGot.exe
        ├── jdownloader provider ── loopback HTTP `/flashgot`
        ├── abdm provider ── loopback HTTP `/queues` and `/add`
        ├── xdm provider ── loopback HTTP `/sync`, `/download`, and `/link`
        ├── uget provider ── uGet quiet command line ── native Firefox process API
        ├── custom command provider ── native Firefox process API
        └── custom aria2 provider ── JSON-RPC
```

On Windows, extension startup deploys `FlashGot.exe` from the XPI to `DownloadIt\FlashGot.exe` under the Firefox profile, then communicates with it through these command-line interfaces:

- `--list-json`: detects available download managers;
- `--job-json`: submits a single- or multi-link download task.

Linux skips deployment and never runs the packaged Windows helper. The rest of the service, including Firefox native downloads, custom commands, aria2, JDownloader, Xtreme Download Manager, toolbar and context-menu UI, the native download prompt, automatic capture, and protocol services, initializes normally.

## Platform support

One universal XPI is published for both supported platforms. It contains the Windows helper so the same artifact remains complete, but Linux ignores that file at runtime.

macOS, Snap Firefox, and Flatpak Firefox are outside the current support scope.

| Integration | Windows | Linux |
| --- | --- | --- |
| Firefox native downloads | Supported | Supported |
| Custom commands | Supported | Supported |
| aria2 JSON-RPC and optional local startup | Supported | Supported |
| JDownloader endpoint and optional local startup | Supported | Supported |
| AB Download Manager loopback API | Supported | Supported |
| Xtreme Download Manager loopback API | Supported | Supported |
| uGet quiet command-line provider | Supported | Supported |
| FlashGot manager discovery and task submission | Supported | Not used |
| Packaged `FlashGot.exe` deployment | Enabled | Skipped |

## Prerequisites

- Windows, or Linux using a distribution-native Firefox package or Mozilla tarball;
- Firefox 136.0 or later;
- A configured custom `userChrome.js-Loader` that is active in the target profile. The version released after 20250219 is recommended because it supports Firefox 135+;
- Linux executables selected for custom commands, aria2 startup, or JDownloader startup must have Unix execute permission, for example `chmod +x /path/to/launcher`;
- Snap and Flatpak Firefox packages are not supported in the first Linux release because their Loader installation, host-file access, and process sandbox boundaries differ from non-sandboxed Firefox;
- External download managers are optional because the Firefox downloader is always available;
- If `addon/FlashGot.exe` is missing during the build, both packaging scripts download the latest successful [Grabby-FlashGot](https://github.com/benzBrake/Grabby-FlashGot) nightly artifact. They use the GitHub Actions API when `GITHUB_TOKEN` or `GH_TOKEN` is available and otherwise download through nightly.link. This binary is excluded by `.gitignore` and is not committed to the Git repository. During packaging, the actual file size and SHA-256 hash are written to generated metadata inside the XPI and used for runtime verification;
- Node.js 18 or later for development and testing;
- PowerShell 7 (`pwsh`) for building on Windows;
- Bash, `curl`, `zip`, `unzip`, `sha256sum`, and GNU core utilities for building on Linux. The authenticated GitHub API path additionally requires `jq`.

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

Both scripts package `addon/` into the same universal `addon.xpi` format in the repository root and verify that the XPI contains at least:

- `bootstrap.js`;
- `install.rdf`;
- `chrome.manifest`;
- `FlashGot.exe`.

`addon.xpi` is a build artifact and is ignored by `.gitignore` by default. `addon/FlashGot.exe` is also excluded from version control. When it is missing, both scripts use `GITHUB_TOKEN` first and then `GH_TOKEN` to access the latest successful nightly artifact through the GitHub Actions API. With neither token set, they download the same artifact through nightly.link. Nightly builds still publish one universal XPI rather than separate platform artifacts.

## Versioning

DownloadIt has its own version line starting at `2.0.0`; the current version is `2.3.0`; the inherited FlashGot version line ends at `1.5.6.14.2`. Releases use `MAJOR.MINOR.PATCH`: increment `MAJOR` for incompatible configuration, data-format, or behavior changes; `MINOR` for backward-compatible features; and `PATCH` for backward-compatible fixes, security updates, and Firefox compatibility adjustments.

The version in `addon/install.rdf` identifies the DownloadIt XPI only and is the source of truth shown by the settings page. The bundled `FlashGot.exe` is an independently built helper whose integrity is tracked through generated size and SHA-256 metadata; its version is never appended to the DownloadIt version.

## Testing

Tests use Node.js's built-in test runner:

```powershell
node --test .\tests\*.test.mjs
```

The test suite covers single- and multi-link download-task JSON, URL and filename validation, selection and page-link extraction, batch-link type and suffix filtering, selection state, download-manager parsing, JDownloader, AB Download Manager, and Xtreme Download Manager local protocol validation and request construction, the toolbar PanelView and context-menu insertion point, allow/deny automatic-capture matching and fallback, IDM local endpoint and byte-level message parsing, the native download prompt integration, Fluent resources, and the staged settings page structure.

DownloadIt Links collects explicit `a[href]` and `area[href]` links from the current DOM, including child frames and open shadow roots. Its type and suffix filters accept multiple selections, using OR within each filter and AND with the search field. Classification is based on the download filename or URL suffix; media element sources and network-level media sniffing are outside this feature.

The **Link groups** settings tab can enable or disable each built-in suffix group and edit the suffixes it manages. Custom groups require a display name, a unique kebab-case key, and at least one suffix; enabled custom groups appear in the type filter. A suffix can belong to only one group, including disabled groups, so a group can be enabled later without creating ambiguous classification rules. Suffixes from disabled groups and unmatched suffixes are classified as **Other**.

## Installation and upgrade

1. Install `userChrome.js-Loader` and confirm that it is active in the target Firefox profile.
2. Run the build command to generate `addon.xpi`.
3. In Firefox, open `about:addons`, choose “Install Add-on From File…” from the gear menu, and select `addon.xpi`.
4. Restart Firefox so that the extension and context menus can finish initializing.

On Linux, perform these steps with a distribution-native or Mozilla tarball Firefox build. Confirm that the Loader can access the profile and that every configured local launcher is executable. Snap and Flatpak packages are outside the supported installation path.

To upgrade, install the newly built `addon.xpi` over the existing installation. If the extension does not start, first check the Loader version, Firefox version, and profile, then check the extension status in `about:addons`.

## Configuration

The DownloadIt toolbar button opens a native Firefox panel. Use “DownloadIt Links” to open the batch-link selector for the active tab, select an available tool to change the default download manager immediately, use “Refresh download managers” to refresh current integrations while enabled built-in protocols are probed concurrently in the background, or open DownloadIt settings from the panel footer. On Windows, built-in HTTP timeouts do not delay or fail FlashGot detection; on Linux, no FlashGot scan is attempted. The button is added to the navigation bar initially and can be moved or removed through Firefox's Customize Toolbar interface.

For a supported link, choosing a downloader directly from the DownloadIt context submenu sends only that link through the selected downloader and leaves the configured default unchanged. Use the separate **Set as default and download** submenu when the selected downloader should also become the new default. Firefox policy can disable the default-changing submenu without disabling one-time downloads.

The discovered-tool list in settings shows capability metadata for the active DownloadIt integration route: `+` means supported, `-` means unsupported, and `?` means the capability is not yet known. The labels cover POST request bodies, cookie handling, DownloadIt batch submissions, caller-provided download directories, and control over whether submitted tasks start automatically. The native provider uses Firefox's own request context, FlashGot capabilities follow the integrations implemented by the bundled bridge, JDownloader and Xtreme Download Manager capabilities follow their loopback protocols, custom command capabilities are inferred from their argument placeholders, and aria2 capabilities follow the JSON-RPC provider. These labels describe what DownloadIt can pass through the configured route, not every feature offered by the downloader itself.

Open the settings page from the toolbar panel, from “DownloadIt Settings” in the context menu, or from the extension settings in `about:addons`.

The manager list uses one editor entry point for configurable integrations. **Add download tool** opens with the **Built-in protocol** tab selected and JDownloader chosen; the **Custom** tab creates repeatable command-line or aria2 definitions. JDownloader, AB Download Manager, Xtreme Download Manager, and uGet are singletons: configuring one reopens its entry. Removing a built-in protocol disables it and clears its namespaced settings. AB Download Manager and XDM become selectable when their local service responds or an absolute launcher path is configured; XDM also accepts a JAR path. uGet becomes selectable only after it is enabled and an absolute launcher path is configured for the current system. Loopback providers start configured launchers only for explicit tests or submissions; uGet directly invokes its quiet CLI for each task and does not probe a background API. FlashGot-backed managers remain automatic detection results and do not appear in the add-tool catalog because they have no DownloadIt-side configuration.

| Preference | Type | Description |
| --- | --- | --- |
| `downloadit.defaultDM` | String | JSON downloader reference such as `{"provider":"native","id":"firefox"}`, `{"provider":"jdownloader","id":"jdownloader"}`, `{"provider":"flashgot","id":"Internet Download Manager"}`, or `{"provider":"custom","id":"<uuid>"}`. Legacy FlashGot names are migrated automatically. |
| `downloadit.omitCookies` | Boolean | When `true`, cookies are not sent to the external download tool. The default is `false`. |
| `downloadit.autoStartTasks` | Boolean | Requests automatic start for providers with the task-start capability. The default is `true`; JDownloader and AB Download Manager consume it. |
| `downloadit.abdm.enabled` | Boolean | Enables the AB Download Manager loopback provider. |
| `downloadit.abdm.endpoint` | String | AB Download Manager API endpoint. Only HTTP loopback URLs are accepted; the default is `http://127.0.0.1:15151/`. |
| `downloadit.abdm.apiKey` | String | Optional API key sent as `X-Api-Key`; it is not shared with JDownloader or FlashGot. |
| `downloadit.abdm.launchPath` | String | Optional absolute path to an AB Download Manager launcher. When the API is offline, this path is used only for an explicit connection test or a submitted download. |
| `downloadit.xdm.enabled` | Boolean | Enables the Xtreme Download Manager loopback provider. It probes the fixed `http://127.0.0.1:8597/sync` endpoint; the default is `true`. |
| `downloadit.xdm.launchPath` | String | Optional absolute path to an XDM launcher or JAR. Linux JAR paths are run with the system Java runtime; when the API is offline, this path is used only for an explicit connection test or a submitted download. |
| `downloadit.uget.enabled` | Boolean | Enables the uGet quiet command-line provider. New installations remain disabled until uGet is configured. |
| `downloadit.uget.launchPath` | String | Absolute path to the uGet launcher for the current system. DownloadIt invokes it with `--quiet` once per submitted link. |
| `downloadit.jdownloader.enabled` | Boolean | Controls whether the JDownloader built-in-protocol integration is configured and shown. New installations default to `false`; existing JDownloader preferences or a JDownloader default selection are treated as an enabled legacy configuration until explicitly removed. |
| `downloadit.jdownloader.endpoint` | String | JDownloader FlashGot endpoint. The default is `http://127.0.0.1:9666/flashgot`. |
| `downloadit.jdownloader.launchPath` | String | Optional absolute path to a JDownloader Windows `.exe`, Linux executable launcher, or `.jar`; a manual value overrides detected installation data. |
| `downloadit.jdownloader.autoLaunch` | Boolean | Starts JDownloader when its endpoint is unavailable. The default is `true`. |
| `downloadit.jdownloader.detectedPath` | String | Installation path reported by a successful GET probe and maintained automatically. |
| `downloadit.jdownloader.detectedJavaArgs` | String | JSON array of validated JVM arguments reported by a successful GET probe and maintained automatically. |
| `downloadit.idmBridgeEnabled` | Boolean | Intercepts compatible IDM local HTTP requests and sends them to the current default downloader. The default is `false`. |
| `downloadit.detectedManagers` | String | Cached FlashGot-backed download-manager detection results, maintained automatically by the extension. |
| `downloadit.linkGroups` | String | Versioned JSON configuration for built-in and custom batch-link suffix groups. |
| `downloadit.mirrors` | String | Versioned JSON configuration for built-in mirror adapters. The GitHub adapter defaults to disabled with `https://gh-proxy.com/` prefilled. |

When a preference is locked by Firefox policy, the settings page displays its locked state and prevents changes.

### Automatic capture rules

User rules are stored as formatted UTF-8 JSON in `DownloadIt\auto-capture-rules.json` under the Firefox profile. The file uses stable UUIDs and typed matchers so additional matcher types, such as domains, can be added without moving the configuration again. The current version accepts extension matchers:

```json
{
  "version": 1,
  "rules": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "action": "allow",
      "match": {
        "type": "extension",
        "value": "zip"
      }
    }
  ]
}
```

The file is created on the first saved rule and written atomically. Invalid JSON, duplicate matches, invalid IDs, and unsupported versions are preserved without being overwritten; automatic capture is disabled until the file is reloaded or explicitly reset from settings. User allow and deny rules can be added, removed individually, or cleared independently from the **Auto-capture** tab.

Automatic capture uses deny-first matching: built-in and user deny rules take priority, user allow rules are captured, and file types in neither list continue through Firefox's native prompt. Download targets are classified before user rules: normal `http`, `https`, `ftp`, and `magnet` targets can be dispatched; `blob:` and `data:` resources remain in Firefox because their contents belong to the originating browser context; and other unsupported schemes are filtered. `.xpi` is an immutable built-in deny entry. HTTP and HTTPS targets whose decoded path ends in `.xpi` or contains a standalone `xpinstall` path marker are rejected by every DownloadIt entry point, while Firefox filename, primary-extension, and MIME metadata provide the same protection when the URL is ambiguous. Query strings, fragments, and hostnames containing the word `xpinstall` do not trigger this path rule. These target restrictions are code-owned and cannot be overridden by current extension rules or future domain rules; referrer and source-page URLs are validated separately and are not mistaken for download targets. Empty extensions likewise remain native. Executable extensions such as `.exe` can be added explicitly to the allow list. When the Firefox downloader is the default, the hook leaves the existing native launcher untouched instead of issuing a duplicate request.

### Mirror adapters

The experimental **Mirror acceleration** settings tab exposes code-owned site adapters and user-configurable endpoints. Adapters are privileged extension modules registered through `MirrorAdapterRegistry`; DownloadIt does not load arbitrary JavaScript from the profile. This keeps site-specific URL semantics isolated so future adapters, such as Hugging Face, can be added without changing the downloader dispatch path.

The built-in GitHub adapter is disabled by default and pre-fills `https://gh-proxy.com/`. When enabled, it prefixes recognized HTTPS file URLs in the form `<endpoint><original-absolute-url>`. It supports release assets, `/archive/`, `/zipball/`, `/tarball/`, repository `/raw/` routes, `codeload.github.com`, and `raw.githubusercontent.com`. Ordinary GitHub pages, API URLs, and temporary `objects.githubusercontent.com` URLs are never guessed or rewritten. The native download dialog uses a matching original channel URI when Firefox retains one; otherwise a redirected object URL remains unchanged.

Mirroring is applied once immediately before every provider dispatch, including context-menu, batch, download-dialog, automatic-capture, native Firefox, and IDM-bridge tasks. POST download tasks are not rewritten. A mirrored link drops its source-site cookies and cookie records, and any batch containing a mirrored link drops page-level cookies. Public endpoints must use HTTPS and may not include credentials, a query, or a fragment; HTTP is accepted only for loopback addresses. DownloadIt does not probe mirror health or retry the original URL after an external downloader accepts a mirrored task. Invalid externally supplied configuration falls back to all adapters disabled without overwriting the stored preference.

### JDownloader provider

The `jdownloader:jdownloader` provider talks directly to JDownloader's FlashGot-compatible endpoint. Its singleton row appears only after the integration is explicitly added or migrated from an existing configuration, and it can be configured or removed from that row. A valid enabled configuration is selectable immediately. At startup and during a manual manager refresh, DownloadIt probes enabled built-in protocols concurrently in the background so JDownloader's online state and installation cache can be refreshed; on Windows this does not delay FlashGot detection. Provider failures are isolated, concurrent probes of the same configured endpoint are shared, and a result is persisted only if JDownloader is still enabled with the same endpoint when the request finishes. Draft connection tests and task submissions can also probe the endpoint. The endpoint is kept under the editor's advanced settings and must be unauthenticated HTTP on `localhost`, `127.0.0.0/8`, or `::1`, with no query or fragment; its path is normalized to `/flashgot`. Redirects are disabled, and probe requests bypass the HTTP cache.

A successful GET response must contain exactly two non-empty lines: an absolute `.jar` path, followed by a `java ... -jar` command ending in that same path. Windows drive and UNC paths and POSIX absolute paths are accepted; their original separator style is preserved. DownloadIt never executes or stores the returned command. It retains only validated `-Xms` and `-Xmx` arguments. A manual launch path takes precedence over the detected cache, and an invalid manual path is reported instead of falling back. Changing the endpoint clears the old discovery cache. The connection-test button probes the draft endpoint without saving it, changing online state, or starting a process.

When a submission finds the endpoint offline and automatic startup is enabled, a selected native launcher is run directly through Firefox's process API. On Windows, JAR startup checks the same-named `.exe`, `JDownloader2.exe`, `JDownloader 2.exe`, and `JDownloader.exe`, then bundled `jre`/`runtime` directories, `JAVA_HOME`, JavaSoft registry homes, and Windows System32, preferring `javaw.exe` to `java.exe`. On Linux, it first checks executable sibling launchers named `JDownloader2` and `JDownloader`, then bundled `jre`/`runtime`, `JAVA_HOME/bin/java`, and each directory in `PATH` for an executable `java`. Java receives only the validated JVM arguments plus `-jar <path>`; no command shell is involved. Concurrent submissions share one startup wait. DownloadIt probes every eight seconds up to six times, then performs each submission POST only once after readiness so a retry cannot duplicate a task.

The UTF-8 form sends newline-aligned `urls`, `descriptions`, and `fnames`, plus `package=DownloadIt`, the task referrer (or download-page URL), and Firefox's preferred download directory when readable. `autostart` follows `downloadit.autoStartTasks`; disabling it does not change any provider without the task-start capability. A batch sends cookies only when every link has the same cookie string, otherwise cookies are omitted for the whole batch. POST data is omitted when all links are empty and sent when all links are identical; mixed or partially different POST bodies reject the batch before probing or launching JDownloader. Download and archive passwords (`dpass` and `apass`) are not implemented.

### AB Download Manager provider

The `abdm:abdm` provider uses AB Download Manager's local HTTP API directly. An enabled configuration probes `GET /queues` in the background; concurrent probes for the same endpoint and API key share one request, and stale results cannot change the state after either value changes. An absolute launcher path makes the provider selectable while the API is offline. Background refreshes never start AB Download Manager. A connection test uses draft values without saving them or changing the configured provider's online state; if the API is unavailable and a draft launcher path is present, the explicit test starts it and waits for the API. Submitted downloads follow the same probe-then-start behavior. Requests use HTTP loopback only, disable redirects, and bypass the HTTP cache.

Tasks are submitted to `POST /add` as JSON. Each item contains `link`, `headers`, `downloadPage`, and `suggestedName`; cookies, Referer, and User-Agent are passed through the item headers. `downloadit.autoStartTasks` maps to the request's `options.silentStart`, while `silentAdd` is always `true`. AB Download Manager does not receive caller-selected directories or POST request bodies; the provider reports those capabilities as unsupported and rejects a task when its POST body cannot be passed through.

On Windows, `FlashGot.exe --list-json` may still report `AB Download Manager`. The native provider hides that exact FlashGot entry while its API is online and leaves it visible as a fallback while the API is offline. If the old default is the FlashGot `AB Download Manager` entry, a successful native probe migrates it to `{"provider":"abdm","id":"abdm"}` unless the default preference is locked.

### Xtreme Download Manager provider

The `xdm:xdm` provider talks directly to Xtreme Download Manager's fixed local HTTP API. It is enabled by default and becomes selectable after `GET http://127.0.0.1:8597/sync` returns valid JSON with `enabled: true`, or when `downloadit.xdm.launchPath` contains an absolute launcher or JAR path for the current system. The path is intentionally not pre-validated by Firefox so manually entered paths remain usable where the file picker or Firefox file API cannot enumerate an otherwise runnable launcher. Startup and manual manager refresh only probe this endpoint in the background, concurrent probes share one request, and redirects are disabled while the cache is bypassed. A connection test uses draft values without saving them or changing the configured provider's online state. An explicit test or submitted download starts the configured path if the API is offline and waits for the endpoint to become ready; an unavailable path reports a launch error at that point.

A single task is sent as JSON to `POST /download`; a batch is sent as an array to `POST /link`. DownloadIt forwards each URL, cookie, User-Agent, and Referer, and forwards the suggested filename for single tasks. XDM does not receive caller-selected directories, POST request bodies, or DownloadIt's task-start preference, so POST tasks are rejected before submission.

### uGet provider

The `uget:uget` provider invokes the configured uGet executable directly through Firefox's native process API. It accepts only an absolute launcher path for the current system and is disabled until the user explicitly enables and configures it. The settings test runs the launcher with `--version`; background refresh does not start uGet or attempt process discovery because uGet does not expose a DownloadIt-compatible local API.

Each link is submitted as a separate `uget --quiet` process. DownloadIt conditionally passes the preferred Firefox download directory, filename, Referer, User-Agent, Cookie, and non-empty POST body as individual `--option=value` arguments, then appends the URL unchanged. A batch therefore creates one uGet CLI invocation per link. The provider reports POST, Cookie, batch, and directory capabilities, but it does not consume `downloadit.autoStartTasks`; uGet's CLI has no per-task start switch. A successful process launch is treated as acceptance by uGet; later downloader failures are outside Firefox's process API boundary.

### IDM local protocol compatibility

When enabled under **Request & privacy**, DownloadIt recognizes the IDM local HTTP request form used by compatible extension clients such as [hmjz100/LinkSwift](https://github.com/hmjz100/LinkSwift): `POST http://127.0.0.1:1001/client/<id>?seq=<seq>`. It requires a Firefox extension principal and validates the byte-length-prefixed `MSG#` payload, then redirects the request to a temporary loopback listener owned by DownloadIt. The task is submitted to the current default downloader, and the requesting client receives the expected sequence response after the downloader accepts or rejects the task.

DownloadIt does not bind port `1001`, replace IDM's native listener, or intercept IDM's WebSocket endpoint. It is not a general port-forwarding proxy: unrecognized, malformed, and non-extension requests are left untouched. Cookies supplied by a compatible request remain subject to `downloadit.omitCookies` for external downloaders; the native provider does not inject that raw Cookie field and uses Firefox's cookie jar. Only the download URL, filename, source page, User-Agent, Referer, and Cookie fields are accepted. The bridge is disabled by default.

### Custom downloaders

Custom definitions are stored as formatted UTF-8 JSON in `DownloadIt\custom-downloaders.json` under the Firefox profile. The built-in-protocol tab never writes entries to this file: JDownloader, AB Download Manager, and Xtreme Download Manager use namespaced Firefox preferences, while FlashGot detection uses `downloadit.detectedManagers`. The file is loaded at startup and can be reloaded from the settings page. Invalid JSON and unsupported versions are preserved without being overwritten; use the explicit reset action to replace a damaged file with an empty configuration. A damaged custom file disables only the custom tab; built-in protocol configuration remains available.

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

Executable and aria2 configuration paths inside Firefox's chrome configuration directory (`UChrm`, normally `<profile>/chrome`) are stored with forward slashes relative to that directory, for example `UserTools/aria2/aria2c.exe`, `UserTools/aria2/aria2c`, and `UserTools/aria2/aria2.conf`. Relative paths are always resolved from `UChrm`; files outside it keep their absolute paths. An absolute path saved on another operating system remains in the configuration but is shown as unavailable on the current platform.

On Windows, custom downloaders hide process windows by default. Clear **Hide process window** to run command-line processes, or an automatically started aria2c process, in the foreground for debugging. Firefox's `nsIProcess.startHidden` option has no Linux effect, so Linux hides this setting while preserving the `startHidden` JSON field for schema and cross-platform compatibility. Existing JSON files without the field retain the current default.

Command-line downloaders select an executable and an arguments template. On Linux the selected file must have execute permission. The editor provides quick templates for `aria2c`, `wget`, and `curl`. DownloadIt invokes the executable directly with Firefox's native process API. When Firefox cannot enumerate a Linux executable, DownloadIt uses `/bin/sh` only as a fixed-argument fallback: it checks the path with `test -f "$1" && test -x "$1"`, then launches it through `exec "$@"`. The executable path and template arguments are always separate process arguments and are never interpolated into shell code. Supported FlashGot-compatible placeholders are `URL`, `FNAME`, `COMMENT`, `REFERER`, `COOKIE`, `CFILE`, `FOLDER`, `POST`, `RAWPOST`, `HEADERS`, `ULIST`, `UFILE`, `USERPASS`, and `UA`. A template containing `ULIST` or `UFILE` starts one process for the batch; otherwise one process is started per link. URL-list and Netscape-cookie temporary files use CRLF on Windows and LF on Linux; HTTP header blocks retain protocol-required CRLF on both platforms.

aria2 definitions connect to an HTTP or HTTPS JSON-RPC endpoint and support an optional secret and server-side download directory. Multiple links are submitted with `system.multicall`. The optional local-startup settings include `executablePath` and `configurationPath`; the executable becomes required only when automatic startup is enabled, while the configuration file may remain empty. When supplied, DownloadIt passes the resolved configuration file as `--conf-path`. Optional aria2c startup is restricted to HTTP loopback endpoints; DownloadIt controls the configuration path, RPC enablement, listen address, port, and secret arguments, waits up to five seconds for readiness, and retries the request once. RPC secrets are stored as plain text in the JSON file and are never written to DownloadIt logs.

The `native:firefox` provider accepts HTTP and HTTPS links, including batches and POST bodies. It inherits the available principal, referrer, container, private-browsing, and cookie-jar context from the source frame. Downloads go directly to Firefox's preferred download directory, use `.part` files, and receive a unique `name(1).ext`-style target when a file already exists. Explicit filenames take priority over the final URL path segment, with `download` as the fallback. DownloadIt does not make a separate redirect or `Content-Disposition` probe, so signed, one-time, and POST URLs are requested only once. The provider remains available in DownloadIt menus and settings but is omitted from Firefox's own download prompt, where the existing **Save File** action already provides the native flow. FTP and magnet links require an external provider.

## Project structure

```text
addon/
├── bootstrap.js                         # Extension lifecycle entry point
├── install.rdf                           # Bootstrapped XPI metadata
├── chrome.manifest                       # chrome://downloadit registration
├── FlashGot.exe                          # Download-manager bridge
└── chrome/content/
    ├── DownloadItService.sys.mjs        # Service, process, and preference management
    ├── DownloadItAutoCapture.sys.mjs    # Versioned typed rules and built-in capture protections
    ├── DownloadItPanelView.sys.mjs      # Native toolbar panel behavior
    ├── DownloadItContextMenu.sys.mjs    # Firefox context menu
    ├── DownloadItDownloadDialog.sys.mjs # Firefox native download prompt integration
    ├── DownloadItDownloaders.sys.mjs    # Provider references, JDownloader/ABDM/XDM/uGet/aria2 protocols, custom schema, and templates
    ├── DownloadItMirrors.sys.mjs        # Mirror adapter registry, settings validation, and task rewriting
    ├── DownloadItGitHubMirror.sys.mjs   # GitHub file-URL adapter
    ├── DownloadItIDMBridge.sys.mjs      # Firefox request hook and loopback response bridge
    ├── DownloadItIDMProtocol.sys.mjs    # IDM local endpoint and byte-level message parser
    ├── DownloadItXUL.sys.mjs             # Shared Firefox XUL element construction helper
    ├── DownloadItLinkCollectorActor.sys.mjs # Selection and page-link extraction Actor
    ├── DownloadItLinks.sys.mjs           # Page-link query, classification, filtering, and selection state
    ├── DownloadItLocalization.sys.mjs   # Firefox Fluent resource registration
    ├── DownloadItProtocol.sys.mjs       # Download-task protocol and validation
    ├── DownloadItUtils.sys.mjs           # Request encoding, domain, and cookie helpers
    ├── icons/downloadit.svg              # Toolbar and extension icon
    ├── locales/
    │   ├── en-US/downloadit.ftl          # English Fluent messages
    │   └── zh-CN/downloadit.ftl          # Simplified Chinese Fluent messages
    ├── panel.css                         # Native toolbar panel styles
    ├── options.xhtml                     # Settings page structure
    ├── options.js                        # Settings page logic
    ├── options.css                       # Settings page styles
    ├── links.xhtml                       # Batch-link selector structure
    ├── links.js                          # Batch-link selector behavior
    └── links.css                         # Batch-link selector styles
pack.ps1                                  # XPI packaging script
pack.sh                                   # Linux XPI packaging script
tests/                                    # Node.js unit tests
```

## License and third-party components

DownloadIt is an unofficial modern port based on the original FlashGot extension. FlashGot was created by Giorgio Maone and is licensed under GPL-2.0-or-later. See [`addon/THIRD_PARTY_NOTICES.txt`](addon/THIRD_PARTY_NOTICES.txt) for related notices.

The bundled `FlashGot.exe` is based on [Grabby-FlashGot](https://github.com/benzBrake/Grabby-FlashGot) and is licensed under GPL-3.0. Each XPI contains `chrome/content/DownloadItBinaryMetadata.sys.mjs`, whose metadata matches the bundled binary and is used for runtime integrity verification.

For the Chinese version, see [README-zh_CN.md](README-zh_CN.md).

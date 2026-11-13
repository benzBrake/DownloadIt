# DownloadIt

<img src="addon/chrome/content/icons/downloadit.svg" alt="DownloadIt icon" width="128">

[![Nightly build](https://img.shields.io/badge/nightly-download-blue?logo=firefox)](https://github.com/benzBrake/DownloadIt/releases/download/nightly/addon.xpi)

[简体中文](README-zh_CN.md) · [Documentation](https://benzbrake.github.io/DownloadIt/)

DownloadIt enhances downloads in modern Firefox, bringing download-manager integration, batch link tools, and flexible download handling into the browser.

The project builds on selected FlashGot integrations and is progressively incorporating download-dialog and save-action enhancements from DownloadPlus (`downloadPlus_Fx136.uc.js`).

## Available today

- Send links to external download managers from the context menu or Firefox's native download prompt, or use Firefox's own downloader.
- Edit suggested filenames (including for Firefox's native Save action), detect legacy encodings for URL-derived names, copy the complete source URL with a content-sized button and success/failure text and animation feedback, and use Save As, editable Save To locations (including removable built-in Desktop, Documents, Pictures, and Downloads folders), or Save and Open in Firefox's download prompt.
- Save and Open is also available for executable downloads and uses Firefox's native download-and-launch handling.
- Collect, filter, copy, and batch-download links from a page or selection, including magnet and ed2k links when supported by the selected downloader.
- Choose from built-in downloader integrations, bundled Aria2Next with AriaNg, custom commands, or aria2 JSON-RPC.
- Control automatic file-type capture and cookie forwarding, with optional GitHub mirror and IDM local-protocol compatibility.

The interface is available in English, Japanese, Simplified Chinese, and Traditional Chinese.

Save To locations are managed together in settings. The arrow beside **Add folder** quickly adds built-in folders; their paths use system-resolved placeholders, while ordinary folders store absolute paths. Built-in names can be customized or left empty for localized defaults. Existing location settings migrate on Apply, preserving custom folders. Removing all locations keeps the list empty.

Pictures uses the Windows user shell-folder configuration or Linux XDG `user-dirs.dirs`, including redirected locations. If no valid existing pictures directory is configured, the built-in entry remains in settings but is omitted from the download menu.

Filename encoding detection uses bundled jschardet and Firefox's native decoders. The button to the right of the filename field offers Automatic, the Firefox filename, and UTF-8, GB18030, Big5, Shift_JIS, EUC-JP, EUC-KR, and Windows-1252. Add up to 30 Firefox-supported encoding names under Settings → Download dialog; separate names with commas or spaces. Switching encodings decodes the original URL bytes and replaces the filename field, including any edits. Server-provided filenames take priority. Short filenames can remain ambiguous; manual selection is available even when automatic detection is disabled.

The **Additional filename encodings** button is beside **Detect URL filename encoding** and is disabled when detection is off. Its dialog accepts multiple names followed by Add or Enter, shows removable entries, and provides quick-add presets for English, Chinese, Hindi, Spanish, Arabic, French, Bengali, Portuguese, Russian, and Indonesian. Done stages the changes for Apply; Cancel or Escape discards dialog changes.

## Where it is heading

DownloadPlus-inspired download-history enhancements remain planned. DownloadIt implements selected download-dialog and save actions, not the full DownloadPlus feature set. It also implements only part of FlashGot's original feature set; media sniffing is not currently supported.

## Requirements and download

DownloadIt supports Firefox 136 or later on Windows and Linux. It is a bootstrapped XPI and requires the customized [userChrome.js Loader](https://github.com/benzBrake/userChrome.js-Loader), or [Bootstrap Loader](https://github.com/benzBrake/BootstrapLoader/) on Firefox Developer Edition and Nightly. It cannot run as a standalone WebExtension.

The bundled Aria2Next supports Windows and Linux x86_64; FlashGot-based manager discovery is Windows-only. macOS and Snap/Flatpak Firefox are outside the current support scope.

[Download the nightly XPI](https://github.com/benzBrake/DownloadIt/releases/download/nightly/addon.xpi) · [User documentation](https://benzbrake.github.io/DownloadIt/) · [Development](docs/development.md)

For manual download and filename-encoding checks, use the [local WSLC download test server](docs/development.md#local-download-test-server).

## Credits and licenses

The original FlashGot was created by Giorgio Maone and is licensed under GPL-2.0-or-later. DownloadPlus is a source for planned download-experience enhancements. Bundled components include Grabby-FlashGot (GPL-3.0), Aria2Next (GPL-2.0), and AriaNg (MIT). See [third-party notices](addon/THIRD_PARTY_NOTICES.txt) for details.

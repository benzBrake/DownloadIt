# DownloadIt

<img src="addon/chrome/content/icons/downloadit.svg" alt="DownloadIt icon" width="128">

[![Nightly build](https://img.shields.io/badge/nightly-download-blue?logo=firefox)](https://github.com/benzBrake/DownloadIt/releases/download/nightly/addon.xpi)

[简体中文](README-zh_CN.md) · [Documentation](https://benzbrake.github.io/DownloadIt/)

DownloadIt enhances downloads in modern Firefox, bringing download-manager integration, batch link tools, and flexible download handling into the browser.

The project builds on selected FlashGot integrations and is progressively incorporating download-dialog and save-action enhancements from DownloadPlus (`downloadPlus_Fx136.uc.js`).

## Available today

- Send links to external download managers from the context menu or Firefox's native download prompt, or use Firefox's own downloader.
- Edit suggested filenames (including for Firefox's native Save action), detect legacy encodings for URL-derived names, copy the complete source URL, and use Save As, editable Save To locations (including removable built-in Desktop, Documents, Pictures, and Downloads folders), or Save and Open in Firefox's download prompt.
- Save and Open is also available for executable downloads and uses Firefox's native download-and-launch handling.
- Collect, filter, copy, and batch-download links from a page or selection, including magnet and ed2k links when supported by the selected downloader.
- Choose from built-in downloader integrations, bundled Aria2Next with AriaNg, custom commands, or aria2 JSON-RPC.
- Control automatic file-type capture and cookie forwarding, with optional GitHub mirror and IDM local-protocol compatibility.

The interface is available in English, Japanese, Simplified Chinese, and Traditional Chinese.

Save To locations are managed together in settings. The arrow beside **Add folder** quickly adds built-in folders; their paths use system-resolved placeholders, while ordinary folders store absolute paths. Built-in names can be customized or left empty for localized defaults. Existing location settings migrate on Apply, preserving custom folders. Removing all locations keeps the list empty.

Pictures uses the Windows user shell-folder configuration or Linux XDG `user-dirs.dirs`, including redirected locations. If no valid existing pictures directory is configured, the built-in entry remains in settings but is omitted from the download menu.

## Where it is heading

DownloadPlus-inspired download-history enhancements remain planned. DownloadIt implements selected download-dialog and save actions, not the full DownloadPlus feature set. It also implements only part of FlashGot's original feature set; media sniffing is not currently supported.

## Requirements and download

DownloadIt supports Firefox 136 or later on Windows and Linux. It is a bootstrapped XPI and requires the customized [userChrome.js Loader](https://github.com/benzBrake/userChrome.js-Loader), or [Bootstrap Loader](https://github.com/benzBrake/BootstrapLoader/) on Firefox Developer Edition and Nightly. It cannot run as a standalone WebExtension.

The bundled Aria2Next supports Windows and Linux x86_64; FlashGot-based manager discovery is Windows-only. macOS and Snap/Flatpak Firefox are outside the current support scope.

[Download the nightly XPI](https://github.com/benzBrake/DownloadIt/releases/download/nightly/addon.xpi) · [User documentation](https://benzbrake.github.io/DownloadIt/) · [Development](docs/development.md)

## Credits and licenses

The original FlashGot was created by Giorgio Maone and is licensed under GPL-2.0-or-later. DownloadPlus is a source for planned download-experience enhancements. Bundled components include Grabby-FlashGot (GPL-3.0), Aria2Next (GPL-2.0), and AriaNg (MIT). See [third-party notices](addon/THIRD_PARTY_NOTICES.txt) for details.

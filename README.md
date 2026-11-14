# DownloadIt

<img src="addon/chrome/content/icons/downloadit.svg" alt="DownloadIt icon" width="128">

[![Nightly build](https://img.shields.io/badge/nightly-download-blue?logo=firefox)](https://github.com/benzBrake/DownloadIt/releases/download/nightly/addon.xpi)

[简体中文](README-zh_CN.md) · [Documentation](https://benzbrake.github.io/DownloadIt/)

DownloadIt enhances downloads in modern Firefox, bringing download-manager integration, batch link tools, and flexible download handling into the browser.

The project builds on selected FlashGot integrations and adds download-dialog, save-action, and download-history enhancements.

## Available today

- **Download-manager integration**: Send links from the context menu or download prompt to external downloaders, with built-in integrations, custom commands, and aria2 JSON-RPC support. Aria2Next and AriaNg are included.
- **yt-dlp video menu**: Configure a separately installed yt-dlp under **Specialized downloaders**. Supported video pages show a floating split button with video, MP3 audio, subtitles-only (all available languages, including automatic captions, excluding live chat), and playlist presets. Add, rename, edit arguments, enable/disable, remove, and reorder menu items; the first enabled item is the main button action. Changes take effect after Apply, including on open pages. DownloadIt adds the current page URL and Firefox download folder automatically; enter only yt-dlp options and quote values containing spaces. Custom `--paths` options can override the folder. Audio extraction/conversion and merging may require FFmpeg/ffprobe; available subtitles and playlists depend on the site.
- **Save To**: Quickly choose a favorite destination in the download prompt, including built-in Desktop, Documents, Pictures, and Downloads folders or your own custom folders. On Windows, an option can automatically add drive roots that have no configured Save To location.
- **Enhanced download prompt**: Edit filenames, copy source links, and choose Save As or Save and Open.
- **Filename encoding correction**: Automatically detect URL filename encodings or select and add encodings manually to fix garbled names.
- **Batch downloads**: Collect, filter, copy, and batch-download links from a page or selection, including magnet and ed2k links when supported by the downloader.
- **Download capture and compatibility**: Automatically capture downloads by file type, with configurable cookie forwarding, GitHub mirrors, and IDM local-protocol compatibility.
- **Download completion sound**: Enable it under **Download history** to play a bundled chime on Windows and Linux, or choose a local audio file with adjustable volume and preview. Off by default; covers Firefox-managed downloads (including private windows), not external downloader completion events. Existing completed records remain silent, and overlapping completion sounds are combined.
- **Multilingual interface**: Available in English, Japanese, Simplified Chinese, and Traditional Chinese.

The **Download history** settings page enables cleanup buttons by default in Firefox **Library → Downloads**: **Remove Failed** and **Remove Unavailable**. The latter refreshes file availability and removes successful download records only when their files have been moved or deleted. Both actions remove records only, keeping actual files. Disabling the setting and applying it also removes the buttons from open Library windows.

The **Request information forwarding** area groups the global cookie-forwarding switch with the read-only **automatically attached** status for Referer and User-Agent.

## Requirements and download

DownloadIt supports Firefox 136 or later on Windows and Linux. It is a bootstrapped XPI and requires the customized [userChrome.js Loader](https://github.com/benzBrake/userChrome.js-Loader), or [Bootstrap Loader](https://github.com/benzBrake/BootstrapLoader/) on Firefox Developer Edition and Nightly. It cannot run as a standalone WebExtension.

The bundled Aria2Next supports Windows and Linux x86_64; FlashGot-based manager discovery is Windows-only. macOS and Snap/Flatpak Firefox are outside the current support scope.

[Download the nightly XPI](https://github.com/benzBrake/DownloadIt/releases/download/nightly/addon.xpi) · [User documentation](https://benzbrake.github.io/DownloadIt/) · [Roadmap](docs/roadmap.md) · [Development](docs/development.md)

For manual download and filename-encoding checks, use the [local WSLC download test server](docs/development.md#local-download-test-server).

## Credits and licenses

The original FlashGot was created by Giorgio Maone and is licensed under GPL-2.0-or-later. Bundled components include Grabby-FlashGot (GPL-3.0), Aria2Next (GPL-2.0), and AriaNg (MIT). See [third-party notices](addon/THIRD_PARTY_NOTICES.txt) for details.

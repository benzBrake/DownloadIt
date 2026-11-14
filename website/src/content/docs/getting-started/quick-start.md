---
title: Quick start
description: Choose a default download manager, send a link from Firefox, collect page links in a batch, and verify that DownloadIt is ready.
sidebar:
  order: 2
  label: Quick start
---

## Check the toolbar panel

Select the DownloadIt toolbar button. The panel shows the current service state, available download tools, a shortcut to **DownloadIt Links**, and a link to settings.

If a recently installed tool is missing, use **Refresh download managers**. Configured built-in integrations are probed in the background; one unavailable tool does not prevent the others from loading.

## Choose the default tool

Select an available tool in the toolbar panel or open DownloadIt settings and choose it under **Download managers**. The Firefox downloader is always available and does not route tasks through the packaged Windows helper.

Separate defaults can be configured for `magnet:` and `ed2k:` links. If a protocol default is empty or invalid, Firefox keeps its native external-protocol flow.

## Send one link

Right-click a supported link and open the DownloadIt submenu:

- Selecting a downloader sends this link once without changing the default.
- **Set as default and download** changes the default and then sends the link.
- The ordinary DownloadIt action uses the current default.

DownloadIt can pass the URL, suggested filename, Referer, User-Agent, and permitted Cookie data. Actual capability depends on the selected integration.

## Collect a page of links

Open **DownloadIt Links** from the toolbar panel or context menu. Filter explicit page links, select the required rows, then download or copy them. See [Download entry points and batch links](../../guides/entry-points-and-links/) for filter and copy behavior.

## Adjust automatic handoff

Automatic capture is conservative by default. Add file extensions to the allow list only when you want remembered Firefox downloads of those types to use DownloadIt. The deny list and built-in safety rules always take priority.

See [Automatic capture](../../guides/auto-capture/) before enabling broad rules.


## Adjust save actions

In **Download dialog** settings, enable the controls you need, configure Save To folders, and click **Apply**. Edit filenames, copy source links, or correct filename encoding when downloading. See [Download dialog and saving](../../guides/download-dialog/).

## Configure the video menu

Install yt-dlp yourself, select its executable under **Specialized Downloaders**, and click **Apply**. Supported pages show a floating menu for video, MP3 audio, subtitles, and playlists. See [yt-dlp video menu](../../guides/yt-dlp/).

## Clean records and enable sound

Open Firefox's **Library → Downloads** to use the cleanup buttons, which are enabled by default. Completion sound is off by default; enable it in **Download history**, choose a sound, set the volume, and preview it. See [Download history and sounds](../../guides/download-history/).

---
title: Download entry points and batch links
description: Use DownloadIt from context menus and Firefox prompts, then collect, filter, copy, or download explicit links from a page and its frames.
sidebar:
  order: 1
  label: Entry points and batch links
---

## Context menu

DownloadIt adds actions for links and selections that contain links. A direct downloader choice applies only to that submission. The separate **Set as default and download** submenu persists the selected tool first; Firefox policy can disable this default-changing action without disabling one-time downloads.

Supported standard targets include HTTP, HTTPS, FTP, `magnet:`, and `ed2k:`. The available downloader list is filtered by each provider's declared protocol capabilities.

## Firefox download prompt

For supported downloads, DownloadIt appears alongside Firefox's native actions. The native Firefox downloader is not duplicated inside this prompt because **Save File** already provides the same route.

When Firefox remembers a file-type action, DownloadIt can also intercept later downloads through automatic capture rules. Protected add-on packages and unsupported schemes remain in Firefox.

## DownloadIt Links

The links window collects explicit `a[href]` and `area[href]` targets from the current document, child frames, and open shadow roots. It does not sniff network traffic or collect media element sources.

The available filters combine as follows:

- Multiple type selections use OR logic.
- Multiple suffix selections use OR logic.
- Type, suffix, protocol, and text search conditions use AND logic with each other.
- The **All**, **Magnet**, and **ed2k** protocol modes are mutually exclusive.

Classification uses the suggested download filename or URL suffix. Disabled and unmatched suffix groups appear under **Other**.

## Copy without downloading

Selected rows can be copied as:

- one URL per line;
- tab-separated title and URL pairs;
- Markdown links.

Copying does not contact a download manager. A batch download preserves row alignment for URLs, titles, filenames, and per-link metadata before it reaches the selected provider.

Link-group names and suffixes can be edited under [Settings reference](../../reference/settings/#link-groups).

---
title: Requests and privacy
description: Understand Cookie forwarding, automatic Referer and User-Agent information, external tools, mirrors, and local configuration storage.
sidebar:
  order: 3
---

DownloadIt works locally without an account or an extension service for uploading download history. Sending a task still contacts its destination and, when selected, an external downloader, RPC service, or mirror.

<span id="request-forwarding"></span>

## Request information forwarding

In **Request and privacy → Request information forwarding**, **Send Cookies to download tools** is the global Cookie switch. Turn it off if external tools do not need this authentication information. A downloader receives only the information its integration supports; the switch does not make every downloader capable of authenticated downloads.

Referer and User-Agent display read-only **Automatically included** states. They are attached when applicable to the integration; there are currently no separate global switches for them. Per-site overrides, custom per-site Referer/User-Agent values, and per-site Cookie rules are planned, not implemented.

Firefox's native downloader uses Firefox's own request and cookie context. The forwarding switch controls external integration paths; it is not a replacement for Firefox's cookie settings. The yt-dlp menu passes the page URL, download directory, and configured arguments; it does not automatically export browser cookies.

## External services and mirrors

Local HTTP integrations and aria2 JSON-RPC send data to the endpoint you configure. Secrets in custom downloader configuration are stored as plain text; do not share the configuration as a public diagnostic attachment.

Mirror routing is optional and off by default. Rewritten tasks omit source-site Cookie data and Cookie files; a batch containing a mirror URL also clears page-level Cookie data. The mirror still receives the file URL. See [Mirrors](../../guides/mirrors/).

yt-dlp page detection runs the external executable against the current page URL, which may contact the website. Its downloads are managed by yt-dlp rather than Firefox.

## Local data and diagnostics

Preferences and custom definitions are stored in the Firefox profile. The uninstall setting controls whether DownloadIt keeps its configuration. History cleanup removes records without deleting files; completion sound does not upload download records.

When reporting issues, remove private URLs, personal paths, Cookies, and RPC secrets. Capture screenshots with sample data, and review them before sharing.

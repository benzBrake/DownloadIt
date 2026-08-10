---
title: Custom commands and aria2
description: Configure repeatable command-line downloaders or aria2 JSON-RPC services with explicit paths, templates, capabilities, and lifecycle behavior.
sidebar:
  order: 4
  label: Custom commands and aria2
---

Custom definitions are stored as formatted JSON in the Firefox profile. If the file is damaged or uses an unsupported schema, DownloadIt preserves it, disables custom editing, and requires an explicit reset before overwriting it.

## Command-line downloader

Choose an executable and provide an argument template. DownloadIt launches it with Firefox's native process API and does not interpolate the executable path or task data into shell code.

Built-in template shortcuts are available for `aria2c`, `wget`, and `curl`. Common FlashGot-compatible placeholders include:

| Placeholder | Value |
| --- | --- |
| `URL` | Current target URL |
| `FNAME` | Suggested filename |
| `REFERER` | Request Referer |
| `COOKIE` / `CFILE` | Cookie value or temporary cookie file |
| `FOLDER` | Download directory |
| `POST` / `RAWPOST` | POST request data |
| `HEADERS` | Request headers |
| `ULIST` / `UFILE` | Batch URL list or list file |
| `UA` | User-Agent |

Templates containing `ULIST` or `UFILE` launch one process for the batch. Other templates launch one process per link.

## Paths and portability

Executables and aria2 configuration files inside the Firefox profile's `chrome` directory are stored as forward-slash relative paths. Files outside it remain absolute. An absolute path from another operating system is preserved but shown as unavailable on the current system.

Linux launchers must have executable permission. If Firefox cannot enumerate an otherwise valid Linux executable, DownloadIt uses a fixed `/bin/sh` fallback that verifies the file and then calls `exec` with separate arguments.

Windows command processes are hidden by default. The **Run hidden** control is not shown on Linux because Firefox does not implement that process option there.

## aria2 JSON-RPC

An aria2 definition connects to an HTTP or HTTPS JSON-RPC endpoint and can include a secret and server-side download directory. Multiple links are submitted through `system.multicall`.

Optional local startup is limited to HTTP loopback endpoints. DownloadIt can launch `aria2c`, pass a selected configuration file, manage the RPC address, port, and secret, then retry the initial request after a short readiness wait.

DownloadIt shuts down only aria2 processes it started. Externally managed services remain running. RPC secrets are stored in the custom JSON file as plain text but are not written to DownloadIt logs.

Cookie forwarding is controlled globally; review [Cookie and privacy](../../reference/privacy/).

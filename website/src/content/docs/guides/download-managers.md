---
title: Download manager integrations
description: Understand the native Firefox provider, built-in local integrations, Windows FlashGot bridge, capability labels, and connection tests.
sidebar:
  order: 3
  label: Download managers
---

DownloadIt presents every usable route through one download-tool list. A route may use Firefox itself, a built-in local protocol, a native executable, the Windows FlashGot bridge, or a custom definition.

## Included routes

| Integration | Windows | Linux | Connection |
| --- | --- | --- | --- |
| Firefox native downloads | Yes | Yes | Firefox Downloads API |
| JDownloader | Yes | Yes | Local FlashGot-compatible HTTP endpoint |
| AB Download Manager | Yes | Yes | Local HTTP API |
| Xtreme Download Manager | Yes | Yes | Local HTTP API |
| uGet | Yes | Yes | Quiet command-line interface |
| Bundled Aria2Next | Yes | x86_64 | Local process and JSON-RPC |
| Custom command or aria2 | Yes | Yes | Native process or JSON-RPC |
| FlashGot-discovered tools | Yes | No | Packaged Windows helper |

The Firefox provider is always available. External tools are optional.

## Add or configure a tool

Open **Download managers** and select **Add download tool**. Built-in protocol integrations are singletons: configuring JDownloader, AB Download Manager, XDM, uGet, or Aria2Next again reopens its existing entry. Removing one disables it and clears its DownloadIt-managed settings.

FlashGot-discovered tools do not appear in this catalog because DownloadIt has no local settings for those manager definitions.

## Capability labels

Each active route reports whether it can receive:

- POST request bodies;
- Cookie data;
- batch submissions;
- a caller-provided download directory;
- the requested task-start state;
- `magnet:` and `ed2k:` URLs.

`+` means supported, `-` means unsupported, and `?` means the integration has not established the capability. These labels describe the DownloadIt route, not every feature of the external application.

## Availability and tests

Configured local HTTP integrations are probed in the background at startup and during refresh. Manual connection tests use the unsaved editor values and do not change the saved provider state. Local launchers are started only for an explicit test or submission, never merely because settings were opened.

For executable templates and external aria2 services, continue with [Custom downloaders](../custom-downloaders/).

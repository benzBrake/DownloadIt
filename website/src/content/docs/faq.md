---
title: Frequently asked questions
description: Answers about the required Loader, AMO availability, Nightly releases, updates, supported systems, external managers, cookies, and FlashGot.
sidebar:
  order: 2
  label: FAQ
---

## Why does DownloadIt require a customized Loader?

DownloadIt uses Firefox internal APIs and the legacy bootstrapped-XPI lifecycle to integrate with browser chrome, download prompts, processes, and privileged request context. A normal WebExtension cannot provide the same integration surface.

## Can I install it from Mozilla Add-ons?

No. DownloadIt is not an AMO WebExtension. Install the customized `userChrome.js-Loader`, then install the XPI from a file in `about:addons`.

## Is there a stable release?

Not currently. The website links to the Nightly pre-release built from `master`. The button and installation page label it as pre-release software.

## Does DownloadIt update automatically?

No. DownloadIt publishes a legacy update manifest, but the current Loader does not check or install it. Download a newer XPI, install it over the existing copy, and restart Firefox when prompted.

## Which systems are supported?

Windows and non-sandboxed Linux Firefox installations are supported. Bundled Aria2Next on Linux requires x86_64. macOS, Snap Firefox, and Flatpak Firefox are outside the current support scope.

## Do I need an external download manager?

No. The native Firefox downloader is always available. External tools add protocol, queue, automation, or command-line capabilities according to their integration route.

## Does DownloadIt replace FlashGot?

DownloadIt ports selected FlashGot download-bridge behavior to current Firefox. On Windows it can use a packaged FlashGot helper to discover compatible managers, but DownloadIt has its own version line, settings, native provider, local protocol integrations, and custom downloader system. It does not yet implement every historical FlashGot feature.

## Can DownloadIt send login cookies?

It can pass Cookie data to capable external routes when **Send cookies** is enabled. The Firefox provider instead uses Firefox's native cookie jar. Turn Cookie forwarding off unless the external tool needs the authenticated request context.

## Does it capture streaming media?

No. DownloadIt Links collects explicit page links. Network media sniffing and media element source discovery are not implemented.

## Where should I report a problem?

Use [GitHub issues](https://github.com/benzBrake/DownloadIt/issues). Include reproducible steps and environment versions, but remove private URLs, filesystem paths, RPC secrets, and Cookie data.

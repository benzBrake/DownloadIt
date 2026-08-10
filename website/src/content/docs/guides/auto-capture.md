---
title: Automatic capture
description: Decide which remembered Firefox downloads DownloadIt may intercept with extension allow and deny lists plus non-overridable safety rules.
sidebar:
  order: 2
  label: Automatic capture
---

Automatic capture affects downloads that Firefox would otherwise route through a remembered file-type action. It does not turn every network response into a DownloadIt task.

## Rule priority

DownloadIt evaluates rules in this order:

1. Built-in target and safety restrictions.
2. Built-in and user deny rules.
3. User allow rules.
4. Firefox's native flow when no rule matches.

Add extensions without a leading dot. Rules are stored in the Firefox profile under DownloadIt's data directory and use stable identifiers so later matcher types can be added without moving the file.

## Targets that can be handed off

HTTP, HTTPS, FTP, `magnet:`, and `ed2k:` targets can use supported external providers. `magnet:` and `ed2k:` may use their protocol-specific defaults without depending on a file-extension allow rule.

`blob:` and `data:` resources belong to the browser context that created them and always remain in Firefox. Unknown schemes and empty extensions also stay native.

## Built-in protection

`.xpi` is a non-editable deny rule. DownloadIt also rejects HTTP and HTTPS targets whose decoded path identifies an XPI or an `xpinstall` route. Suggested filenames and MIME metadata are considered when the URL is ambiguous.

These restrictions apply to every DownloadIt entry point and cannot be overridden by user rules. Ordinary `xpinstall` text in a hostname, query string, fragment, Referer, or source-page URL does not by itself trigger the path rule.

## When Firefox is the default

If the native Firefox provider is selected, DownloadIt preserves the existing launcher instead of requesting the same address again. This avoids duplicate network requests for signed, one-time, or POST-backed downloads.

Review related controls in [Settings reference](../../reference/settings/#automatic-capture).

---
title: Mirror acceleration
description: Enable the experimental GitHub mirror adapter, validate a safe endpoint, and understand rewrite, Cookie, and failure behavior.
sidebar:
  order: 5
  label: Mirror acceleration
---

Mirror acceleration is experimental and disabled by default. It rewrites recognized file URLs before a task is sent to a provider; it does not proxy browser pages or execute adapter code loaded from the profile.

## GitHub adapter

The built-in adapter recognizes HTTPS file routes including release assets, archives, `zipball`, `tarball`, repository `raw` routes, `codeload.github.com`, and `raw.githubusercontent.com`.

Normal GitHub pages, API URLs, and temporary `objects.githubusercontent.com` URLs are not guessed or rewritten. If Firefox retains a matching original channel URL, that URL is preferred over a redirected object address.

## Endpoint requirements

The endpoint is prepended to the original absolute URL. Public endpoints must:

- use HTTPS;
- contain no username or password;
- contain no query string or fragment.

HTTP is permitted only for loopback addresses. DownloadIt validates the endpoint shape but does not perform a health check.

## Privacy and failures

Rewritten links do not carry source-site Cookie data or Cookie files. If any link in a batch is mirrored, page-level Cookie data is removed from that batch as well.

POST tasks are never rewritten. After an external manager accepts a mirrored task, DownloadIt does not retry the original URL if the mirror fails.

Use only an endpoint you trust. The default value is a convenience, not a service availability guarantee.

---
title: Troubleshooting
description: Diagnose installation, startup, missing toolbar controls, unavailable download managers, Linux launch failures, and damaged configuration.
sidebar:
  order: 1
---

## DownloadIt does not start

1. Confirm that Firefox meets the minimum version in [Platform compatibility](../reference/compatibility/).
2. Confirm that the selected Loader is installed for the Firefox application and profile you are opening. Firefox Developer Edition and Nightly can use [`Bootstrap Loader`](https://github.com/benzBrake/BootstrapLoader/) instead of the customized `userChrome.js-Loader`.
3. Check that DownloadIt is enabled in `about:addons`.
4. Restart Firefox after installation or upgrade.
5. If you use several profiles, open `about:support` and verify the active profile directory.

## The toolbar button is missing

Open Firefox's **Customize Toolbar** screen and find DownloadIt. New installations add it to the navigation bar, but Firefox preserves later toolbar customization.

## A download manager is unavailable

- Open the toolbar panel and select **Refresh download managers**.
- For JDownloader, AB Download Manager, or XDM, verify the configured loopback endpoint and run the explicit connection test.
- Verify any manual launcher path. An invalid manual path does not fall back to an older detected path.
- For uGet and command-line tools, verify that the selected executable belongs to the current operating system.
- For Aria2Next, confirm that the platform and architecture are supported and that the RPC probe succeeds.

## A task is rejected

Compare the task with the capability labels for the selected route. Common causes include POST data sent to a provider that cannot accept it, an unsupported protocol, mixed POST bodies in a batch, or a protected XPI target.

Try the native Firefox provider for an ordinary HTTP or HTTPS download. It preserves Firefox's request context and avoids external-process capability limits.

## Linux launcher failures

Use a distribution-native Firefox package or Mozilla tarball. Confirm the launcher exists and is executable, for example with `chmod +x /path/to/launcher`. Snap and Flatpak process boundaries are not supported.

## Settings cannot be saved

A Firefox policy may lock the preference; the settings page shows this state. If a custom downloader or rule JSON file is invalid, DownloadIt preserves the file and disables unsafe overwrites. Use retry after correcting it externally, or use the explicit reset action when discarding the damaged configuration is acceptable.

For behavior not covered here, search the [GitHub issues](https://github.com/benzBrake/DownloadIt/issues) and include the Firefox version, operating system, DownloadIt version, entry point, and selected provider without posting secrets or Cookie data.

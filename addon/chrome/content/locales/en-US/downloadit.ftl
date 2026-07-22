downloadit-download =
    .label = DownloadIt
    .accesskey = D
downloadit-download-selection =
    .label = Downloadit Selection
downloadit-options =
    .label = DownloadIt options
    .accesskey = O
downloadit-no-manager =
    .label = No supported download manager was detected
downloadit-refresh =
    .label = Detect download managers again
downloadit-settings =
    .label = DownloadIt settings
downloadit-download-failed = Could not send the link to { $manager }: { $error }
downloadit-download-selection-failed = Could not send the selected links to { $manager }: { $error }
downloadit-refresh-done =
    { $count ->
        [one] One supported download manager detected.
       *[other] { $count } supported download managers detected.
    }
downloadit-scan-failed = Could not detect download managers: { $error }
downloadit-unsupported = This link type cannot be sent to DownloadIt.

downloadit-brand-subtitle = download bridge
downloadit-nav =
    .aria-label = Settings sections
downloadit-nav-managers = Download manager
downloadit-nav-privacy = Request & privacy
downloadit-nav-about = About / diagnostics
downloadit-manager-kicker = 01 / runtime
downloadit-manager-title = Download manager
downloadit-manager-description = Choose the default tool for DownloadIt downloads and inspect the managers available on this system.
downloadit-privacy-kicker = 02 / request policy
downloadit-privacy-title = Request & privacy
downloadit-privacy-description = Choose which browser request details are forwarded to external download tools.
downloadit-about-kicker = 03 / service details
downloadit-about-title = About / diagnostics
downloadit-about-description = A compact view of the bridge service and its deployed component.
downloadit-service-starting = Service starting
downloadit-service-ready = Service connected
downloadit-service-unavailable = Service unavailable
downloadit-manager-count = { NUMBER($count) }
downloadit-manager-count-label =
    { $count ->
        [one] available download manager
       *[other] available download managers
    }
downloadit-detection-idle = Current detection cache
downloadit-detection-loading = Scanning for download managers...
downloadit-detection-success =
    { $count ->
        [one] Scan complete: one manager detected
       *[other] Scan complete: { $count } managers detected
    }
downloadit-detection-error = Scan failed: { $error }
downloadit-no-managers = No supported download manager was detected
downloadit-default-manager-eyebrow = default route
downloadit-default-manager-title = Default download manager
downloadit-default-manager-label = Default tool for the DownloadIt context menu
downloadit-default-manager-help = DownloadIt sends links to the manager selected here.
downloadit-refresh-managers = Detect again
downloadit-available-eyebrow = live scan
downloadit-available-title = Detected tools
downloadit-manager-default = default
downloadit-no-manager-option = No available download manager
downloadit-locked = Locked by Firefox policy
downloadit-privacy-eyebrow = request headers
downloadit-send-cookies-title = Send cookies to download managers
downloadit-send-cookies-help = Preserve the current site's login state for downloads that require it.
downloadit-cookie-locked = This setting is locked by a Firefox policy.
downloadit-automatic-eyebrow = automatic handling
downloadit-automatic-title = Forwarded with each task
downloadit-referer-title = Referer
downloadit-user-agent-title = User-Agent
downloadit-automatic-label = automatically attached
downloadit-automatic-help = These values help the external manager reproduce the request made by the current page.
downloadit-about-eyebrow = runtime details
downloadit-version-label = Extension version
downloadit-platform-label = Platform support
downloadit-service-label = Background service
downloadit-binary-label = Component path
downloadit-windows = Windows
downloadit-unsupported-platform = Windows only
downloadit-ready = Ready
downloadit-starting = Starting
downloadit-unavailable = Unavailable
downloadit-about-callout-title = DownloadIt connects Firefox to external download tools.
downloadit-about-callout-help = If the list is empty, install a supported manager and detect again.
downloadit-no-changes = No changes to apply
downloadit-unsaved-changes = Changes are ready to apply
downloadit-applied = Settings applied
downloadit-applying = Applying settings...
downloadit-cancel = Cancel
downloadit-apply = Apply
downloadit-error-locked-default = The default manager preference is locked.
downloadit-error-locked-cookies = The cookie preference is locked.
downloadit-error-unsupported-manager = The selected manager is no longer available.
downloadit-error-service = The DownloadIt service is not ready.
downloadit-error-unexpected = DownloadIt error: { $error }

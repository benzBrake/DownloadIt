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
downloadit-download-dialog-option =
    .label = Use DownloadIt
    .accesskey = D
downloadit-download-dialog-manager = Download manager
downloadit-download-dialog-action =
    .label = DownloadIt
    .tooltiptext = Send this download to DownloadIt
    .accesskey = D
downloadit-download-dialog-default-manager = { $manager } (default)
downloadit-download-dialog-no-manager = No supported download manager is available.
downloadit-download-dialog-failed = Could not send this download to { $manager }: { $error }
downloadit-auto-extensions-eyebrow = remembered types
downloadit-auto-extensions-title = Automatic file types
downloadit-auto-extensions-help = Downloads with these extensions are sent to the current default manager without opening the Firefox download prompt.
downloadit-no-auto-extensions = No file types are remembered.
downloadit-clear-auto-extensions = Clear all
downloadit-remove-extension =
    .aria-label = Remove { $extension } from automatic downloads
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
downloadit-manager-description = Choose the default download manager and inspect the managers available on this system.
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
        [one] FlashGot manager detected
       *[other] FlashGot managers detected
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
downloadit-default-manager-label = Default download manager
downloadit-default-manager-help = Downloads handled by DownloadIt use the manager selected here.
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
downloadit-error-locked-extensions = The remembered file types preference is locked.
downloadit-error-unsupported-manager = The selected manager is no longer available.
downloadit-error-service = The DownloadIt service is not ready.
downloadit-error-unexpected = DownloadIt error: { $error }

downloadit-custom-downloader-menu-label =
    .label = { $name } (custom)
downloadit-download-dialog-custom-default-manager = { $manager } (custom, default)
downloadit-reload-custom-downloaders =
    .title = Reload custom downloaders from disk
    .aria-label = Reload custom downloaders from disk
downloadit-add-custom-downloader = Add custom downloader
downloadit-retry-custom-downloaders = Retry loading
downloadit-reset-custom-downloaders = Reset custom configuration
downloadit-custom-editor-eyebrow = custom route
downloadit-custom-editor-add-title = Add custom downloader
downloadit-custom-editor-edit-title = Edit custom downloader
downloadit-custom-editor-close =
    .title = Close custom downloader editor
    .aria-label = Close custom downloader editor
downloadit-custom-editor-save = Save to draft
downloadit-custom-name-label = Display name
downloadit-custom-enabled-title = Enable this downloader
downloadit-custom-enabled-help = Enabled and valid downloaders appear in DownloadIt menus.
downloadit-custom-type-label = Downloader type
downloadit-custom-type-control =
    .aria-label = Downloader type
downloadit-custom-type-command = Command line
downloadit-custom-type-aria2 = aria2 JSON-RPC
downloadit-custom-start-hidden-title = Hide process window
downloadit-custom-start-hidden-help = Applies to command launches and aria2c auto-start. Turn this off to show the process window while debugging.
downloadit-command-path-label = Executable
downloadit-executable-path-help = Executables inside Firefox's chrome configuration directory are stored as portable relative paths.
downloadit-command-template-label = Arguments template
downloadit-command-preset =
    .aria-label = Insert a command-line template preset
downloadit-command-preset-placeholder = Quick preset
downloadit-command-placeholder =
    .aria-label = Command placeholder
downloadit-command-placeholder-insert =
    .title = Insert selected placeholder
    .aria-label = Insert selected placeholder
downloadit-browse = Browse
downloadit-clear = Clear
downloadit-aria2-url-label = JSON-RPC URL
downloadit-aria2-secret-label = RPC secret (stored as plain text)
downloadit-aria2-directory-label = Server download directory (optional)
downloadit-aria2-autostart-title = Start aria2c automatically
downloadit-aria2-autostart-help = Only HTTP loopback RPC endpoints can be started by DownloadIt.
downloadit-aria2-path-label = aria2c executable (required for auto-start)
downloadit-aria2-configuration-label = aria2 configuration file (optional)
downloadit-aria2-configuration-help = When selected, DownloadIt uses this file when starting aria2c. Files inside Firefox's chrome directory are stored as relative paths.
downloadit-aria2-arguments-label = Additional startup arguments
downloadit-aria2-test = Test connection
downloadit-aria2-testing = Testing connection...
downloadit-aria2-test-success = Connected to aria2 { $version }
downloadit-aria2-test-failed = Connection failed: { $error }
downloadit-custom-config-load-error = Custom configuration could not be loaded: { $error }
downloadit-no-downloaders = No available or configured downloader.
downloadit-manager-custom = custom
downloadit-manager-unavailable = unavailable
downloadit-manager-disabled = disabled
downloadit-enable-custom =
    .title = Enable { $name }
    .aria-label = Enable custom downloader { $name }
downloadit-disable-custom =
    .title = Disable { $name }
    .aria-label = Disable custom downloader { $name }
downloadit-edit-custom =
    .title = Edit { $name }
    .aria-label = Edit custom downloader { $name }
downloadit-remove-custom =
    .title = Remove { $name }
    .aria-label = Remove custom downloader { $name }
downloadit-confirm-reload-custom = Discard unsaved custom-downloader changes and reload the file?
downloadit-confirm-reset-custom = Replace the custom-downloader file with an empty configuration? The current file will be overwritten.
downloadit-confirm-remove-custom = Remove the custom downloader “{ $name }” from the draft?
downloadit-custom-reloaded = Custom downloaders reloaded
downloadit-custom-reset = Custom downloader configuration reset
downloadit-browse-executable-title = Select downloader executable
downloadit-browse-aria2-configuration-title = Select aria2 configuration file
downloadit-aria2-configuration-filter = aria2 configuration (*.conf)
downloadit-error-custom-file-root = The custom-downloader file has an invalid structure.
downloadit-error-custom-file-version = This custom-downloader file version is not supported.
downloadit-error-custom-entry = A custom-downloader entry is invalid.
downloadit-error-custom-id = A custom downloader has an invalid or duplicate ID.
downloadit-error-custom-name-duplicate = Custom downloader names must be unique.
downloadit-error-custom-name-required = Enter a custom downloader name.
downloadit-error-custom-name-too-long = The custom downloader name is too long.
downloadit-error-custom-type = Select a supported custom downloader type.
downloadit-error-command-path = Select the command-line downloader executable.
downloadit-error-command-url = The arguments template must include URL, ULIST, or UFILE.
downloadit-error-command-quote = The arguments template contains an unterminated quote.
downloadit-error-command-placeholder = The arguments template contains an invalid placeholder.
downloadit-error-aria2-url = Enter a valid HTTP or HTTPS aria2 JSON-RPC URL.
downloadit-error-aria2-path = Select aria2c before enabling automatic startup.
downloadit-error-aria2-local = Automatic startup requires an HTTP loopback aria2 URL.
downloadit-error-aria2-managed-argument = Additional arguments cannot override DownloadIt-managed aria2 RPC options.
downloadit-error-executable-relative-path = The selected file's relative path must remain inside Firefox's chrome configuration directory.
downloadit-error-custom-config-blocked = Reload or reset the damaged custom configuration before editing it.
downloadit-error-command-launch = The command-line downloader could not be started.
downloadit-error-command-partial =
    { $succeeded ->
        [one] One command process started
       *[other] { NUMBER($succeeded) } command processes started
    }; { $failed ->
        [one] one could not be started.
       *[other] { NUMBER($failed) } could not be started.
    }
downloadit-error-aria2-unavailable = The aria2 JSON-RPC service is unavailable.
downloadit-error-aria2-http = The aria2 service returned HTTP status { $status }.
downloadit-error-aria2-response = The aria2 service returned an invalid response.
downloadit-error-aria2-rpc = aria2 rejected the request: { $error }
downloadit-error-aria2-partial =
    aria2 accepted { NUMBER($succeeded) } { $succeeded ->
        [one] task
       *[other] tasks
    } and rejected { NUMBER($failed) } { $failed ->
        [one] task.
       *[other] tasks.
    }
downloadit-error-aria2-start-timeout = aria2c started, but its JSON-RPC service did not become ready in time.

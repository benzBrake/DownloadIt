downloadit-download =
    .label = DownloadIt
    .accesskey = D
downloadit-toolbar-button =
    .label = DownloadIt
    .tooltiptext = Open DownloadIt controls
    .aria-label = Open DownloadIt controls
downloadit-download-selection =
    .label = Downloadit Selection
downloadit-download-links =
    .label = DownloadIt Links
    .accesskey = L
downloadit-links-window-title = DownloadIt Links
downloadit-links-title = Page links
downloadit-links-filter-region =
    .aria-label = Link filters
downloadit-links-search =
    .placeholder = Search name, filename, or URL
    .aria-label = Search page links
downloadit-links-type-label = Type
downloadit-links-type-all = All types
downloadit-links-type-image = Images
downloadit-links-type-video = Video
downloadit-links-type-audio = Audio
downloadit-links-type-document = Documents
downloadit-links-type-archive = Archives
downloadit-links-type-program = Programs
downloadit-links-type-other = Other
downloadit-links-types-selected =
    { $count ->
        [one] 1 type selected
       *[other] { NUMBER($count) } types selected
    }
downloadit-links-show-all-types = Show all types
downloadit-links-extension-label = Suffix
downloadit-links-extension-all = All suffixes
downloadit-links-extension-selected = .{ $extension }
downloadit-links-extension-none = No suffix
downloadit-links-extensions-selected =
    { $count ->
        [one] 1 suffix selected
       *[other] { NUMBER($count) } suffixes selected
    }
downloadit-links-show-all-extensions = Show all suffixes
downloadit-links-list-region =
    .aria-label = Page links
downloadit-links-select-visible =
    .aria-label = Select or clear all shown links
downloadit-links-select-visible-label = Select shown
downloadit-links-column-type = Type
downloadit-links-column-link = Link
downloadit-links-column-extension = Suffix
downloadit-links-loading = Collecting page links...
downloadit-links-empty = No supported links were found on this page.
downloadit-links-no-matches = No links match the current filters.
downloadit-links-clear-selection = Clear selection
downloadit-links-manager-label = Downloader
downloadit-links-result-count = { NUMBER($visible) } of { NUMBER($total) } shown
downloadit-links-selection-count = { NUMBER($selected) } of { NUMBER($total) } selected
downloadit-links-download-button =
    { $count ->
        [one] Download 1 link
       *[other] Download { NUMBER($count) } links
    }
downloadit-links-no-manager = No available downloader
downloadit-links-custom-manager = { $manager } (custom)
downloadit-links-extension-none-option = No suffix ({ NUMBER($count) })
downloadit-links-extension-option = .{ $extension } ({ NUMBER($count) })
downloadit-links-select-link =
    .aria-label = Select { $name }
downloadit-links-no-extension = none
downloadit-links-submitting =
    { $count ->
        [one] Sending 1 link to the downloader...
       *[other] Sending { NUMBER($count) } links to the downloader...
    }
downloadit-links-submit-failed = Could not send the selected links to { $manager }: { $error }
downloadit-links-service-unavailable = The DownloadIt service or page context is unavailable.
downloadit-links-load-failed = Could not collect page links: { $error }
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
downloadit-panel-selection-error = Could not change the default download manager: { $error }

downloadit-brand-subtitle = download bridge
downloadit-nav =
    .aria-label = Settings sections
downloadit-nav-managers = Download manager
downloadit-nav-link-groups = Link groups
downloadit-nav-privacy = Request & privacy
downloadit-nav-about = About / diagnostics
downloadit-manager-kicker = 01 / runtime
downloadit-manager-title = Download manager
downloadit-manager-description = Choose the default download manager and inspect the managers available on this system.
downloadit-link-groups-kicker = 02 / classification rules
downloadit-link-groups-title = Link groups
downloadit-link-groups-description = Control how file suffixes are classified in the batch-link selector.
downloadit-privacy-kicker = 03 / request policy
downloadit-privacy-title = Request & privacy
downloadit-privacy-description = Choose which browser request details are forwarded to external download tools.
downloadit-about-kicker = 04 / service details
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
downloadit-idm-eyebrow = local protocol
downloadit-idm-title = IDM local protocol
downloadit-idm-bridge-title = Intercept compatible IDM HTTP requests
downloadit-idm-bridge-help = Forward compatible extension requests for IDM's localhost endpoint to the current default manager. Supports <a data-l10n-name="linkswift">hmjz100/LinkSwift</a> without the IDM browser extension.
downloadit-idm-bridge-locked = This setting is locked by a Firefox policy.
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
downloadit-error-locked-idm-bridge = The IDM local protocol preference is locked.
downloadit-error-unsupported-manager = The selected manager is no longer available.
downloadit-error-service = The DownloadIt service is not ready.
downloadit-error-unexpected = DownloadIt error: { $error }

downloadit-link-group-count-label = enabled groups
downloadit-link-group-count = { NUMBER($count) }
downloadit-custom-link-group-count =
    { $count ->
        [one] One custom group
       *[other] { NUMBER($count) } custom groups
    }
downloadit-built-in-link-groups-eyebrow = default taxonomy
downloadit-built-in-link-groups-title = Built-in groups
downloadit-built-in-link-groups-help = Disable a group to classify its suffixes as Other, or edit its suffix list to match your workflow.
downloadit-custom-link-groups-eyebrow = personal taxonomy
downloadit-custom-link-groups-title = Custom groups
downloadit-custom-link-groups-help = Custom groups appear by display name in the type filter. Keys identify groups internally and must be unique.
downloadit-add-custom-link-group = Add group
downloadit-no-custom-link-groups = No custom groups have been added.
downloadit-link-group-toggle =
    .aria-label = Enable group { $group }
downloadit-link-group-no-extensions = No suffixes assigned
downloadit-edit-link-group =
    .title = Edit group { $group }
    .aria-label = Edit group { $group }
downloadit-remove-link-group =
    .title = Remove group { $group }
    .aria-label = Remove group { $group }
downloadit-confirm-remove-link-group = Remove the custom group “{ $group }”?
downloadit-link-group-editor-eyebrow = classification rule
downloadit-link-group-editor-add-title = Add custom group
downloadit-link-group-editor-edit-title = Edit custom group
downloadit-link-group-editor-built-in-title = Edit built-in group
downloadit-link-group-editor-close =
    .title = Close link group editor
    .aria-label = Close link group editor
downloadit-link-group-editor-save = Save to draft
downloadit-link-group-name-label = Display name
downloadit-link-group-key-label = Key
downloadit-link-group-key-help = Use lowercase letters, numbers, and single hyphens; the key must start with a letter.
downloadit-link-group-enabled-title = Enable this group
downloadit-link-group-enabled-help = Enabled groups appear in the batch-link type filter and classify their assigned suffixes.
downloadit-link-group-extensions-label = Managed suffixes
downloadit-link-group-extensions-help = Enter suffixes without a leading dot, separated by spaces, commas, semicolons, or new lines.
downloadit-error-locked-link-groups = The link group preference is locked.
downloadit-error-link-group-settings = The saved link group configuration is invalid.
downloadit-error-link-group-key-required = A group key is required.
downloadit-error-link-group-key-invalid = “{ $key }” is not a valid group key.
downloadit-error-link-group-key-duplicate = The group key “{ $key }” is already in use.
downloadit-error-link-group-key-reserved = The group key “{ $key }” is reserved by DownloadIt.
downloadit-error-link-group-name-required = A display name is required.
downloadit-error-link-group-name-too-long = The display name cannot exceed 80 characters.
downloadit-error-link-group-extensions-invalid = The suffix list for “{ $key }” is invalid.
downloadit-error-link-group-extensions-required = Add at least one suffix to “{ $key }”.
downloadit-error-link-group-extension-invalid = “{ $extension }” is not a valid suffix for “{ $key }”.
downloadit-error-link-group-extension-duplicate = The suffix .{ $extension } is assigned to both “{ $firstKey }” and “{ $secondKey }”.

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

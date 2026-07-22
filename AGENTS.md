# Conventions

If `AGENTS.local.md` exists, follow the conventions in it first.

This repository ports selected FlashGot functionality to the latest Firefox and depends on a customized userChrome.js Loader. DownloadIt is the project name.

Implementation must use Firefox's internal functions only. Do not use utility functions provided by the userChrome.js Loader.

Documentation must be maintained bilingually: keep the English version in `README.md` and the Simplified Chinese version in `README-zh_CN.md`. When updating either README, update the corresponding content in the other language as well.

## Localization and text handling

Use Firefox's built-in Fluent localization system for all user-visible extension text, including UI text, context-menu labels, dialogs, notifications, errors, tooltips, access keys, and `aria-*` attributes.

Store localization resources only in the dedicated directory below:

```text
addon/chrome/content/locales/<locale>/downloadit.ftl
```

The supported locales are `en-US` and `zh-CN`. Keep the same message IDs in both files, with `en-US` as the source locale. Use Firefox's native `L10nFileSource`, `L10nRegistry`, `document.l10n`, `Localization`, and `MozXULElement.insertFTLIfNeeded` APIs. Register the extension source at `chrome://downloadit/content/locales/{locale}/` and reference resources through Firefox's localization system.

Do not use the userChrome.js Loader's localization features, locale registration, locale helpers, or other localization utilities. Do not add `chrome.manifest locale` entries for this purpose.

Use stable, unique, kebab-case l10n IDs. Apply localization with `data-l10n-id`, `data-l10n-args`, `document.l10n.setAttributes()`, or `formatValue()`. Wait for `document.l10n.ready` before relying on initial translations, and use the asynchronous formatting API for text that must be retrieved rather than applied to the DOM.

Treat localized output as opaque. Never concatenate translated fragments, replace `%s` placeholders, split or truncate translated text, change its case, or rely on English word order. Pass values as Fluent arguments and let Fluent/Intl handle pluralization, number formatting, dates, gender, directionality, and other language-specific behavior.

External download-manager names, paths, and raw error details are data, not translations. Pass them as arguments to a complete Fluent message when they must be shown to users. Keep protocol keys, preference names, logs, binary names, and other non-user-facing text out of FTL.

The localized metadata in `install.rdf` is a Firefox manifest mechanism and is the only documented exception to the runtime FTL rule. It should not be migrated to runtime localization.

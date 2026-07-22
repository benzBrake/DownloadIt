const SOURCE_NAME = "downloadit";
const SOURCE_META_SOURCE = "app";
const SUPPORTED_LOCALES = ["en-US", "zh-CN"];
const SOURCE_PRE_PATH = "chrome://downloadit/content/locales/{locale}/";
const RESOURCE = "downloadit.ftl";

export function registerDownloadItLocalization(window) {
  const registry = window.L10nRegistry.getInstance();
  if (!registry.hasSource(SOURCE_NAME)) {
    registry.registerSources([
      new window.L10nFileSource(
        SOURCE_NAME,
        SOURCE_META_SOURCE,
        SUPPORTED_LOCALES,
        SOURCE_PRE_PATH,
      ),
    ]);
  }
  return registry;
}

export async function initializeDownloadItLocalization(window) {
  registerDownloadItLocalization(window);

  const document = window.document;
  if (document.l10n) {
    // Browser chrome documents add this resource after their initial markup
    // has already been parsed. Register it directly so dynamic menus can
    // format messages before the link mutation is observed.
    document.l10n.addResourceIds([RESOURCE]);
  }

  let insertPromise;
  if (window.MozXULElement?.insertFTLIfNeeded) {
    insertPromise = window.MozXULElement.insertFTLIfNeeded(RESOURCE);
  } else if (!document.querySelector(
    `link[rel="localization"][href="${RESOURCE}"]`,
  )) {
    const link = document.createElement("link");
    link.setAttribute("rel", "localization");
    link.setAttribute("href", RESOURCE);
    document.head.append(link);
  }

  await insertPromise;
  if (document.l10n) {
    await document.l10n.ready;
    await document.l10n.formatValue("downloadit-root");
  }
}

(() => {
"use strict";

const { getActiveService } = ChromeUtils.importESModule(
  "chrome://downloadit/content/DownloadItService.sys.mjs",
);
const { initializeDownloadItLocalization } = ChromeUtils.importESModule(
  "chrome://downloadit/content/DownloadItLocalization.sys.mjs",
);
const {
  createDefaultLinkGroupSettings,
  getExtensionOptions,
  LinkSelectionModel,
  queryPageLinks,
} = ChromeUtils.importESModule(
  "chrome://downloadit/content/DownloadItLinks.sys.mjs",
);

const DOWNLOAD_ERROR_MESSAGES = {
  "native-download-failed": "downloadit-error-native-start",
  "native-partial-failure": "downloadit-error-native-partial",
  "command-launch-failed": "downloadit-error-command-launch",
  "command-partial-failure": "downloadit-error-command-partial",
  "aria2-unavailable": "downloadit-error-aria2-unavailable",
  "aria2-http-error": "downloadit-error-aria2-http",
  "aria2-response-invalid": "downloadit-error-aria2-response",
  "aria2-rpc-error": "downloadit-error-aria2-rpc",
  "aria2-partial-failure": "downloadit-error-aria2-partial",
  "aria2-autostart-local-only": "downloadit-error-aria2-local",
  "aria2-start-timeout": "downloadit-error-aria2-start-timeout",
  "jdownloader-endpoint-invalid": "downloadit-error-jdownloader-endpoint",
  "jdownloader-unavailable": "downloadit-error-jdownloader-unavailable",
  "jdownloader-discovery-invalid": "downloadit-error-jdownloader-discovery",
  "jdownloader-http-error": "downloadit-error-jdownloader-http",
  "jdownloader-launch-path-invalid": "downloadit-error-jdownloader-path",
  "jdownloader-launch-failed": "downloadit-error-jdownloader-launch",
  "jdownloader-start-timeout": "downloadit-error-jdownloader-start-timeout",
  "jdownloader-submit-failed": "downloadit-error-jdownloader-submit",
  "jdownloader-mixed-post-data": "downloadit-error-jdownloader-mixed-post",
  "abdm-endpoint-invalid": "downloadit-error-abdm-endpoint",
  "abdm-api-key-invalid": "downloadit-error-abdm-api-key",
  "abdm-unavailable": "downloadit-error-abdm-unavailable",
  "abdm-http-error": "downloadit-error-abdm-http",
  "abdm-response-invalid": "downloadit-error-abdm-response",
  "abdm-submit-failed": "downloadit-error-abdm-submit",
  "abdm-post-unsupported": "downloadit-error-abdm-post",
  "abdm-launch-path-invalid": "downloadit-error-abdm-path",
  "abdm-launch-failed": "downloadit-error-abdm-launch",
  "abdm-start-timeout": "downloadit-error-abdm-start-timeout",
  "xdm-unavailable": "downloadit-error-xdm-unavailable",
  "xdm-disabled": "downloadit-error-xdm-disabled",
  "xdm-http-error": "downloadit-error-xdm-http",
  "xdm-response-invalid": "downloadit-error-xdm-response",
  "xdm-submit-failed": "downloadit-error-xdm-submit",
  "xdm-post-unsupported": "downloadit-error-xdm-post",
  "xdm-launch-path-invalid": "downloadit-error-xdm-path",
  "xdm-launch-failed": "downloadit-error-xdm-launch",
  "xdm-start-timeout": "downloadit-error-xdm-start-timeout",
};

const TYPE_MESSAGE_IDS = {
  image: "downloadit-links-type-image",
  video: "downloadit-links-type-video",
  audio: "downloadit-links-type-audio",
  document: "downloadit-links-type-document",
  archive: "downloadit-links-type-archive",
  program: "downloadit-links-type-program",
  other: "downloadit-links-type-other",
};

const localizationReady = initializeDownloadItLocalization(window);
const numberFormatter = new Intl.NumberFormat();

const state = {
  service: null,
  context: null,
  model: new LinkSelectionModel(),
  filters: {
    types: new Set(),
    extensions: new Set(),
    search: "",
  },
  loading: true,
  busy: false,
  managers: [],
  linkGroups: createDefaultLinkGroupSettings(),
  openFilter: "",
};

function setLocalized(element, id, args = null) {
  if (element && document.l10n) {
    document.l10n.setAttributes(element, id, args);
  }
}

async function formatMessage(id, args = null) {
  await localizationReady;
  return args == null
    ? document.l10n.formatValue(id)
    : document.l10n.formatValue(id, args);
}

function normalizeDownloader(value) {
  return typeof value === "string"
    ? { key: value, name: value, custom: false }
    : value;
}

const FILTER_CONTROLS = {
  types: {
    container: "[data-multi-select=\"types\"]",
    toggle: "type-filter",
    menu: "type-filter-menu",
    summary: "type-filter-summary",
    clear: "clear-type-filter",
  },
  extensions: {
    container: "[data-multi-select=\"extensions\"]",
    toggle: "extension-filter",
    menu: "extension-filter-menu",
    summary: "extension-filter-summary",
    clear: "clear-extension-filter",
  },
};

function filterElements(name) {
  const ids = FILTER_CONTROLS[name];
  return {
    container: document.querySelector(ids.container),
    toggle: document.getElementById(ids.toggle),
    menu: document.getElementById(ids.menu),
    summary: document.getElementById(ids.summary),
    clear: document.getElementById(ids.clear),
  };
}

function closeFilterMenu({ restoreFocus = false } = {}) {
  if (!state.openFilter) {
    return false;
  }
  const { toggle, menu } = filterElements(state.openFilter);
  menu.hidden = true;
  toggle.setAttribute("aria-expanded", "false");
  state.openFilter = "";
  if (restoreFocus) {
    toggle.focus();
  }
  return true;
}

function openFilterMenu(name) {
  if (state.openFilter === name) {
    closeFilterMenu({ restoreFocus: true });
    return;
  }
  closeFilterMenu();
  const { toggle, menu } = filterElements(name);
  menu.hidden = false;
  toggle.setAttribute("aria-expanded", "true");
  state.openFilter = name;
  const controls = [...menu.querySelectorAll("input:not(:disabled), button:not(:disabled)")];
  const selected = controls.find(control => control.matches("input:checked"));
  (selected || controls[0])?.focus();
}

function handleFilterMenuKeyDown(event) {
  if (!state.openFilter) {
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeFilterMenu({ restoreFocus: true });
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    return;
  }
  const { menu } = filterElements(state.openFilter);
  const controls = [...menu.querySelectorAll("input:not(:disabled), button:not(:disabled)")];
  if (controls.length === 0) {
    return;
  }
  event.preventDefault();
  const current = controls.indexOf(document.activeElement);
  let next = 0;
  if (event.key === "End") {
    next = controls.length - 1;
  } else if (event.key === "ArrowUp") {
    next = current <= 0 ? controls.length - 1 : current - 1;
  } else if (event.key === "ArrowDown") {
    next = current < 0 || current === controls.length - 1 ? 0 : current + 1;
  }
  controls[next].focus();
}

function updateFilterValue(event) {
  const checkbox = event.target.closest("input[data-filter-type]");
  if (!checkbox) {
    return;
  }
  const values = state.filters[checkbox.dataset.filterType];
  if (checkbox.checked) {
    values.add(checkbox.value);
  } else {
    values.delete(checkbox.value);
  }
  renderFilterSummary(checkbox.dataset.filterType);
  renderLinks();
}

function clearFilter(name) {
  state.filters[name].clear();
  syncFilterCheckboxes(name);
  renderFilterSummary(name);
  renderLinks();
}

function syncFilterCheckboxes(name) {
  const { menu } = filterElements(name);
  for (const checkbox of menu.querySelectorAll(`input[data-filter-type="${name}"]`)) {
    checkbox.checked = state.filters[name].has(checkbox.value);
  }
}

function bindEvents() {
  document.getElementById("search").addEventListener("input", event => {
    state.filters.search = event.target.value;
    renderLinks();
  });
  document.getElementById("type-filter").addEventListener("click", () => {
    openFilterMenu("types");
  });
  document.getElementById("extension-filter").addEventListener("click", () => {
    openFilterMenu("extensions");
  });
  document.getElementById("type-filter-menu").addEventListener(
    "change",
    updateFilterValue,
  );
  document.getElementById("extension-filter-menu").addEventListener(
    "change",
    updateFilterValue,
  );
  document.getElementById("clear-type-filter").addEventListener(
    "click",
    () => clearFilter("types"),
  );
  document.getElementById("clear-extension-filter").addEventListener(
    "click",
    () => clearFilter("extensions"),
  );
  document.getElementById("manager").addEventListener("change", () => {
    renderSelectionState();
  });
  document.getElementById("select-visible").addEventListener("change", event => {
    state.model.setVisibleSelected(state.filters, event.target.checked);
    renderLinks();
  });
  document.getElementById("link-list").addEventListener("change", event => {
    const checkbox = event.target.closest("input[data-link-url]");
    if (!checkbox) {
      return;
    }
    state.model.setSelected(checkbox.dataset.linkUrl, checkbox.checked);
    checkbox.closest(".link-row")?.classList.toggle("is-selected", checkbox.checked);
    renderSelectionState(state.model.visible(state.filters));
  });
  document.getElementById("clear-selection").addEventListener("click", () => {
    state.model.clearSelection();
    renderLinks();
  });
  document.getElementById("cancel").addEventListener("click", () => window.close());
  document.getElementById("download").addEventListener("click", submitDownloads);
  document.addEventListener("pointerdown", event => {
    if (
      state.openFilter &&
      !filterElements(state.openFilter).container.contains(event.target)
    ) {
      closeFilterMenu();
    }
  });
  document.addEventListener("focusin", event => {
    if (
      state.openFilter &&
      !filterElements(state.openFilter).container.contains(event.target)
    ) {
      closeFilterMenu();
    }
  });
  document.addEventListener("keydown", handleFilterMenuKeyDown);
  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && state.openFilter) {
      event.preventDefault();
      closeFilterMenu({ restoreFocus: true });
    } else if (event.key === "Escape" && !state.busy) {
      window.close();
    }
  });
}

async function renderManagers() {
  const select = document.getElementById("manager");
  select.replaceChildren();
  state.managers = (state.service?.managers || []).map(normalizeDownloader);
  if (state.managers.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = await formatMessage("downloadit-links-no-manager");
    select.append(option);
    select.value = "";
    return;
  }

  for (const manager of state.managers) {
    const option = document.createElement("option");
    option.value = manager.key;
    option.textContent = manager.custom
      ? await formatMessage("downloadit-links-custom-manager", {
          manager: manager.name,
        })
      : manager.name;
    select.append(option);
  }
  const defaultManager = state.service?.defaultManager || "";
  select.value = state.managers.some(manager => manager.key === defaultManager)
    ? defaultManager
    : state.managers[0].key;
}

function renderFilterSummary(name) {
  const values = state.filters[name];
  const { toggle, summary, clear } = filterElements(name);
  toggle.classList.toggle("has-selection", values.size > 0);
  clear.disabled = state.loading || state.busy || values.size === 0;
  if (values.size === 0) {
    setLocalized(
      summary,
      name === "types"
        ? "downloadit-links-type-all"
        : "downloadit-links-extension-all",
    );
    return;
  }
  if (values.size > 1) {
    setLocalized(
      summary,
      name === "types"
        ? "downloadit-links-types-selected"
        : "downloadit-links-extensions-selected",
      { count: values.size },
    );
    return;
  }
  const [value] = values;
  if (name === "types") {
    setTypeLabel(summary, value);
  } else if (value) {
    setLocalized(summary, "downloadit-links-extension-selected", {
      extension: value,
    });
  } else {
    setLocalized(summary, "downloadit-links-extension-none");
  }
}

function typeGroups() {
  return [
    ...state.linkGroups.groups.filter(group => group.enabled),
    { key: "other", builtIn: true, enabled: true, extensions: [] },
  ];
}

function setTypeLabel(element, key) {
  const group = typeGroups().find(value => value.key === key);
  if (group?.builtIn && TYPE_MESSAGE_IDS[key]) {
    setLocalized(element, TYPE_MESSAGE_IDS[key]);
  } else {
    element.removeAttribute("data-l10n-id");
    element.textContent = group?.name || key;
  }
}

function renderTypeOptions() {
  const container = document.getElementById("type-filter-options");
  const elements = typeGroups().map(group => {
    const label = document.createElement("label");
    label.className = "multi-select-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = group.key;
    checkbox.dataset.filterType = "types";
    checkbox.checked = state.filters.types.has(group.key);
    const text = document.createElement("span");
    setTypeLabel(text, group.key);
    label.append(checkbox, text);
    return label;
  });
  container.replaceChildren(...elements);
  syncFilterCheckboxes("types");
}

async function renderExtensionOptions() {
  const container = document.getElementById("extension-filter-options");
  const options = getExtensionOptions(state.model.records);
  const elements = await Promise.all(options.map(async entry => {
    const label = document.createElement("label");
    label.className = "multi-select-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = entry.extension;
    checkbox.dataset.filterType = "extensions";
    checkbox.checked = state.filters.extensions.has(entry.extension);
    const text = document.createElement("span");
    text.textContent = !entry.extension
      ? await formatMessage("downloadit-links-extension-none-option", {
          count: entry.count,
        })
      : await formatMessage("downloadit-links-extension-option", {
          extension: entry.extension,
          count: entry.count,
        });
    label.append(checkbox, text);
    return label;
  }));
  container.replaceChildren(...elements);
  syncFilterCheckboxes("extensions");
}

function createLinkRow(record) {
  const row = document.createElement("label");
  row.className = "link-row";
  if (state.model.selectedURLs.has(record.url)) {
    row.classList.add("is-selected");
  }

  const selection = document.createElement("span");
  selection.className = "row-select";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.linkUrl = record.url;
  checkbox.checked = state.model.selectedURLs.has(record.url);
  checkbox.disabled = state.busy;
  checkbox.setAttribute("data-l10n-attrs", "aria-label");
  setLocalized(checkbox, "downloadit-links-select-link", {
    name: record.description,
  });
  const number = document.createElement("span");
  number.className = "row-number";
  number.textContent = numberFormatter.format(record.index + 1);
  selection.append(checkbox, number);

  const type = document.createElement("span");
  type.className = "type-label";
  type.dataset.type = record.type;
  setTypeLabel(type, record.type);

  const copy = document.createElement("span");
  copy.className = "link-copy";
  const description = document.createElement("span");
  description.className = "link-description";
  description.textContent = record.description;
  const url = document.createElement("span");
  url.className = "link-url";
  url.textContent = record.url;
  copy.append(description, url);

  const extension = document.createElement("span");
  extension.className = "extension";
  if (record.extension) {
    extension.textContent = `.${record.extension}`;
  } else {
    setLocalized(extension, "downloadit-links-no-extension");
  }

  row.append(selection, type, copy, extension);
  return row;
}

function renderLinks() {
  const list = document.getElementById("link-list");
  const empty = document.getElementById("empty-state");
  const visible = state.model.visible(state.filters);
  const fragment = document.createDocumentFragment();
  for (const record of visible) {
    fragment.append(createLinkRow(record));
  }
  list.replaceChildren(fragment);
  empty.hidden = state.loading || visible.length > 0;
  if (!empty.hidden) {
    setLocalized(
      document.getElementById("empty-state-message"),
      state.model.records.length > 0
        ? "downloadit-links-no-matches"
        : "downloadit-links-empty",
    );
  }
  Promise.resolve(document.l10n?.translateFragment?.(list)).catch(error => {
    console.error("DownloadIt: link row localization failed", error);
  });
  renderSelectionState(visible);
}

function renderSelectionState(visible = state.model.visible(state.filters)) {
  const visibleState = state.model.selectionState(visible);
  const selectVisible = document.getElementById("select-visible");
  selectVisible.checked = visibleState.checked;
  selectVisible.indeterminate = visibleState.indeterminate;
  selectVisible.disabled = state.loading || state.busy || visibleState.disabled;

  setLocalized(document.getElementById("result-count"), "downloadit-links-result-count", {
    visible: visible.length,
    total: state.model.records.length,
  });
  setLocalized(document.getElementById("selection-count"), "downloadit-links-selection-count", {
    selected: state.model.selectedCount,
    total: state.model.records.length,
  });
  setLocalized(document.getElementById("download"), "downloadit-links-download-button", {
    count: state.model.selectedCount,
  });

  document.getElementById("clear-selection").disabled =
    state.busy || state.model.selectedCount === 0;
  document.getElementById("download").disabled = Boolean(
    state.loading ||
    state.busy ||
    state.model.selectedCount === 0 ||
    !document.getElementById("manager").value,
  );
  document.getElementById("manager").disabled =
    state.busy || state.managers.length === 0;
  document.getElementById("cancel").disabled = state.busy;
  document.getElementById("search").disabled = state.loading || state.busy;
  for (const name of Object.keys(FILTER_CONTROLS)) {
    const { toggle, menu, clear } = filterElements(name);
    toggle.disabled = state.loading || state.busy || state.model.records.length === 0;
    clear.disabled = state.loading || state.busy || state.filters[name].size === 0;
    for (const checkbox of menu.querySelectorAll("input")) {
      checkbox.disabled = state.loading || state.busy;
    }
  }
  for (const checkbox of document.querySelectorAll("#link-list input")) {
    checkbox.disabled = state.loading || state.busy;
  }
}

function setFeedback(id, args = null, kind = "") {
  const feedback = document.getElementById("feedback");
  feedback.hidden = false;
  feedback.className = `feedback${kind ? ` is-${kind}` : ""}`;
  setLocalized(feedback, id, args);
}

async function formatDownloadError(error) {
  const id = DOWNLOAD_ERROR_MESSAGES[error?.code];
  return id
    ? formatMessage(id, error.args || null)
    : error?.message || String(error);
}

async function submitDownloads() {
  const managerKey = document.getElementById("manager").value;
  const links = state.model.selectedLinks();
  if (state.busy || !state.service || !managerKey || links.length === 0) {
    return;
  }

  state.busy = true;
  closeFilterMenu();
  setFeedback("downloadit-links-submitting", { count: links.length }, "busy");
  renderSelectionState();
  const contexts = links.map(link => ({
    ...link,
    browser: state.context.browser,
    referer: state.context.referer || "",
    downloadPageReferer: state.context.downloadPageReferer || "",
  }));
  try {
    await state.service.downloadLinks(contexts, managerKey);
    window.close();
  } catch (error) {
    const manager = state.managers.find(value => value.key === managerKey);
    setFeedback(
      error?.code === "unsupported-url"
        ? "downloadit-unsupported"
        : "downloadit-links-submit-failed",
      error?.code === "unsupported-url"
        ? null
        : {
            manager: manager?.name || managerKey,
            error: await formatDownloadError(error),
          },
      "error",
    );
    state.busy = false;
    renderSelectionState();
  }
}

async function init() {
  try {
    await localizationReady;
    state.context = window.arguments?.[0]?.wrappedJSObject || {};
    state.service = getActiveService();
    state.linkGroups = state.service?.linkGroups || createDefaultLinkGroupSettings();
    document.getElementById("page-url").textContent =
      state.context.referer || state.context.browser?.currentURI?.spec || "";
    bindEvents();
    renderTypeOptions();
    await renderManagers();
    renderSelectionState();

    if (!state.service || !state.context.browser) {
      state.loading = false;
      document.getElementById("loading-state").hidden = true;
      setFeedback("downloadit-links-service-unavailable", null, "error");
      renderLinks();
      return;
    }

    const links = await queryPageLinks(state.context.browser);
    state.model = new LinkSelectionModel(links, state.linkGroups);
    state.loading = false;
    document.getElementById("loading-state").hidden = true;
    await renderExtensionOptions();
    renderFilterSummary("types");
    renderFilterSummary("extensions");
    renderLinks();
    document.getElementById("search").focus();
  } catch (error) {
    state.loading = false;
    document.getElementById("loading-state").hidden = true;
    setFeedback("downloadit-links-load-failed", {
      error: error?.message || String(error),
    }, "error");
    renderLinks();
    console.error("DownloadIt: links dialog initialization failed", error);
  }
}

window.addEventListener("DOMContentLoaded", init, { once: true });
})();

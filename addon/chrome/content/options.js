(() => {
"use strict";

const { classes: Cc, interfaces: Ci } = Components;
const { getActiveService } = ChromeUtils.importESModule(
  "chrome://downloadit/content/DownloadItService.sys.mjs",
);
const { initializeDownloadItLocalization } = ChromeUtils.importESModule(
  "chrome://downloadit/content/DownloadItLocalization.sys.mjs",
);
const { createXULElement } = ChromeUtils.importESModule(
  "chrome://downloadit/content/DownloadItXUL.sys.mjs",
);
const {
  COMMAND_PLACEHOLDERS,
  COMMAND_TEMPLATE_PRESETS,
  validateCustomDownloaderDocument,
} = ChromeUtils.importESModule(
  "chrome://downloadit/content/DownloadItDownloaders.sys.mjs",
);
const localizationReady = initializeDownloadItLocalization(window);

const SECTION_META = {
  managers: [
    "downloadit-manager-kicker",
    "downloadit-manager-title",
    "downloadit-manager-description",
  ],
  privacy: [
    "downloadit-privacy-kicker",
    "downloadit-privacy-title",
    "downloadit-privacy-description",
  ],
  about: [
    "downloadit-about-kicker",
    "downloadit-about-title",
    "downloadit-about-description",
  ],
};

const CUSTOM_ERROR_MESSAGES = {
  "invalid-root": "downloadit-error-custom-file-root",
  "unsupported-version": "downloadit-error-custom-file-version",
  "invalid-downloaders": "downloadit-error-custom-file-root",
  "invalid-entry": "downloadit-error-custom-entry",
  "invalid-id": "downloadit-error-custom-id",
  "duplicate-id": "downloadit-error-custom-id",
  "duplicate-name": "downloadit-error-custom-name-duplicate",
  "name-required": "downloadit-error-custom-name-required",
  "name-too-long": "downloadit-error-custom-name-too-long",
  "invalid-type": "downloadit-error-custom-type",
  "command-path-required": "downloadit-error-command-path",
  "command-url-required": "downloadit-error-command-url",
  "command-unterminated-quote": "downloadit-error-command-quote",
  "command-placeholder-invalid": "downloadit-error-command-placeholder",
  "aria2-url-invalid": "downloadit-error-aria2-url",
  "aria2-path-required": "downloadit-error-aria2-path",
  "aria2-autostart-local-only": "downloadit-error-aria2-local",
  "aria2-managed-argument": "downloadit-error-aria2-managed-argument",
  "executable-relative-path-invalid": "downloadit-error-executable-relative-path",
  "custom-config-blocked": "downloadit-error-custom-config-blocked",
  "aria2-unavailable": "downloadit-error-aria2-unavailable",
  "aria2-http-error": "downloadit-error-aria2-http",
  "aria2-response-invalid": "downloadit-error-aria2-response",
  "aria2-rpc-error": "downloadit-error-aria2-rpc",
};

const state = {
  section: "managers",
  service: null,
  snapshot: null,
  initial: null,
  draft: null,
  scanState: "idle",
  scanMessage: "",
  busy: false,
  feedback: null,
  feedbackKind: "",
  editor: null,
  editorReturnFocus: null,
  defaultManagerTouched: false,
};

let renderedManagerKeys = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function localizedMessage(id, args = null) {
  return { id, args };
}

function setLocalized(element, id, args = null) {
  if (element && document.l10n) {
    document.l10n.setAttributes(element, id, args);
  }
}

function setLocalizedMessage(element, message) {
  if (message) {
    setLocalized(element, message.id, message.args);
  }
}

function createSettingsState(snapshot) {
  return {
    defaultManager: snapshot.defaultManager,
    omitCookies: snapshot.omitCookies,
    autoExtensions: [...snapshot.autoExtensions],
    customDownloaders: clone(snapshot.customDownloaders),
  };
}

function bindEvents() {
  for (const button of document.querySelectorAll(".nav-item")) {
    button.addEventListener("click", () => {
      state.section = button.dataset.section;
      render();
    });
  }

  document.getElementById("default-manager").addEventListener("command", event => {
    const item = event.target?.localName === "menuitem"
      ? event.target
      : event.currentTarget.selectedItem;
    const key = item?.downloadItManagerKey;
    const downloader = draftDownloaders().find(value => value.key === key);
    if (!downloader) {
      return;
    }
    state.draft.defaultManager = downloader.key;
    state.defaultManagerTouched = true;
    clearFeedback();
    render();
  });
  document.getElementById("send-cookies").addEventListener("change", event => {
    state.draft.omitCookies = !event.target.checked;
    clearFeedback();
    render();
  });
  document.getElementById("refresh-managers").addEventListener("click", refreshManagers);
  document.getElementById("reload-custom-downloaders").addEventListener(
    "click",
    reloadCustomDownloaders,
  );
  document.getElementById("retry-custom-downloaders").addEventListener(
    "click",
    reloadCustomDownloaders,
  );
  document.getElementById("reset-custom-downloaders").addEventListener(
    "click",
    resetCustomDownloaders,
  );
  document.getElementById("add-custom-downloader").addEventListener(
    "click",
    () => openCustomEditor(),
  );
  document.getElementById("manager-list").addEventListener("click", event => {
    const edit = event.target.closest("[data-edit-custom]");
    const remove = event.target.closest("[data-remove-custom]");
    const toggle = event.target.closest("[data-toggle-custom]");
    if (edit) {
      openCustomEditor(edit.dataset.editCustom);
    } else if (remove) {
      removeCustomDownloader(remove.dataset.removeCustom);
    } else if (toggle) {
      toggleCustomDownloader(toggle.dataset.toggleCustom);
    }
  });
  document.getElementById("clear-auto-extensions").addEventListener("click", () => {
    if (!state.draft || state.snapshot?.autoExtensionsLocked) {
      return;
    }
    state.draft.autoExtensions = [];
    clearFeedback();
    render();
  });
  document.getElementById("auto-extension-list").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-extension]");
    if (!button || !state.draft || state.snapshot?.autoExtensionsLocked) {
      return;
    }
    state.draft.autoExtensions = state.draft.autoExtensions.filter(
      value => value !== button.dataset.removeExtension,
    );
    clearFeedback();
    render();
  });

  for (const button of document.querySelectorAll("[data-custom-type]")) {
    button.addEventListener("click", () => setEditorType(button.dataset.customType));
  }
  document.getElementById("custom-aria2-autostart").addEventListener(
    "change",
    renderEditorType,
  );
  document.getElementById("browse-command-path").addEventListener(
    "click",
    () => browseExecutable("custom-command-path"),
  );
  document.getElementById("browse-aria2-path").addEventListener(
    "click",
    () => browseExecutable("custom-aria2-path"),
  );
  document.getElementById("clear-aria2-path").addEventListener(
    "click",
    () => clearFilePath("custom-aria2-path"),
  );
  document.getElementById("browse-aria2-configuration").addEventListener(
    "click",
    browseAria2Configuration,
  );
  document.getElementById("clear-aria2-configuration").addEventListener(
    "click",
    () => clearFilePath("custom-aria2-configuration"),
  );
  document.getElementById("insert-command-placeholder").addEventListener(
    "click",
    insertCommandPlaceholder,
  );
  document.getElementById("custom-command-preset").addEventListener(
    "change",
    applyCommandTemplatePreset,
  );
  document.getElementById("test-aria2").addEventListener("click", testAria2);
  document.getElementById("custom-editor-save").addEventListener(
    "click",
    saveCustomEditor,
  );
  for (const id of ["custom-editor-close", "custom-editor-cancel"]) {
    document.getElementById(id).addEventListener("click", closeCustomEditor);
  }
  document.getElementById("custom-downloader-editor").addEventListener(
    "click",
    event => {
      if (event.target.id === "custom-downloader-editor") {
        closeCustomEditor();
      }
    },
  );
  document.addEventListener("keydown", event => {
    if (!state.editor) {
      return;
    }
    if (event.key === "Escape") {
      closeCustomEditor();
    } else if (event.key === "Tab") {
      trapEditorFocus(event);
    }
  });
  document.getElementById("apply").addEventListener("click", applySettings);
  document.getElementById("cancel").addEventListener("click", () => window.close());
}

function isDirty() {
  return Boolean(
    state.initial &&
    state.draft &&
    JSON.stringify(state.initial) !== JSON.stringify(state.draft)
  );
}

function customDownloadersAreDirty() {
  return Boolean(
    state.initial &&
    state.draft &&
    JSON.stringify(state.initial.customDownloaders) !==
      JSON.stringify(state.draft.customDownloaders)
  );
}

function setFeedback(message, kind = "") {
  state.feedback = message;
  state.feedbackKind = kind;
}

function clearFeedback() {
  state.feedback = null;
  state.feedbackKind = "";
}

function render() {
  const meta = SECTION_META[state.section];
  setLocalized(document.getElementById("section-kicker"), meta[0]);
  setLocalized(document.getElementById("section-title"), meta[1]);
  setLocalized(document.getElementById("section-description"), meta[2]);
  for (const button of document.querySelectorAll(".nav-item")) {
    const active = button.dataset.section === state.section;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  }
  for (const section of document.querySelectorAll("[data-section-panel]")) {
    section.hidden = section.dataset.sectionPanel !== state.section;
  }

  renderServiceState();
  renderManagers();
  renderAutoExtensions();
  renderPrivacy();
  renderAbout();

  const dirty = isDirty();
  const changeState = document.getElementById("change-state");
  const applyButton = document.getElementById("apply");
  changeState.className = "change-state";
  if (state.feedback) {
    setLocalizedMessage(changeState, state.feedback);
    changeState.classList.add(state.feedbackKind === "error" ? "is-error" : "is-success");
  } else if (state.busy) {
    setLocalized(changeState, "downloadit-applying");
  } else if (dirty) {
    setLocalized(changeState, "downloadit-unsaved-changes");
    changeState.classList.add("is-dirty");
  } else {
    setLocalized(changeState, "downloadit-no-changes");
  }
  applyButton.disabled = !dirty || state.busy || !state.service;
}

function renderServiceState() {
  const service = state.snapshot;
  const sidebarStatus = document.getElementById("sidebar-status");
  const sidebarDot = document.getElementById("sidebar-status-dot");
  const serviceStatus = document.getElementById("service-status");
  const platformStatus = document.getElementById("platform-status");
  sidebarDot.className = "status-dot";
  if (!service) {
    setLocalized(sidebarStatus, "downloadit-service-unavailable");
    sidebarDot.classList.add("is-error");
    setLocalized(serviceStatus, "downloadit-unavailable");
    serviceStatus.className = "is-error";
    setLocalized(platformStatus, "downloadit-unsupported-platform");
    return;
  }
  if (service.serviceReady) {
    setLocalized(sidebarStatus, "downloadit-service-ready");
    sidebarDot.classList.add("is-ready");
    setLocalized(serviceStatus, "downloadit-ready");
    serviceStatus.className = "is-ready";
  } else {
    setLocalized(sidebarStatus, "downloadit-service-starting");
    sidebarDot.classList.add("is-pending");
    setLocalized(serviceStatus, "downloadit-starting");
    serviceStatus.className = "is-pending";
  }
  setLocalized(
    platformStatus,
    service.platformSupported ? "downloadit-windows" : "downloadit-unsupported-platform",
  );
}

function draftDownloaders() {
  const detected = (state.snapshot?.downloaders || []).filter(
    downloader => !downloader.custom,
  );
  const snapshotCustom = new Map(
    (state.snapshot?.downloaders || [])
      .filter(downloader => downloader.custom)
      .map(downloader => [downloader.ref.id, downloader]),
  );
  const custom = (state.draft?.customDownloaders?.downloaders || []).map(entry => {
    const saved = snapshotCustom.get(entry.id);
    const unchanged = saved?.configuration &&
      JSON.stringify(saved.configuration) === JSON.stringify(entry);
    const available = unchanged
      ? saved.available
      : entry.enabled && (
          entry.type === "command"
            ? Boolean(entry.command?.executablePath && entry.command?.argumentsTemplate)
            : Boolean(entry.aria2?.rpcUrl && (!entry.aria2.autoStart || entry.aria2.executablePath))
        );
    return {
      ref: { provider: "custom", id: entry.id },
      key: JSON.stringify({ provider: "custom", id: entry.id }),
      name: entry.name,
      type: entry.type,
      custom: true,
      enabled: entry.enabled,
      available,
      unavailableReason: unchanged
        ? saved.unavailableReason
        : entry.enabled ? "invalid-configuration" : "disabled",
    };
  });
  return [...detected, ...custom];
}

function renderManagers() {
  const snapshot = state.snapshot;
  const downloaders = draftDownloaders();
  const available = downloaders.filter(downloader => downloader.available);
  const select = document.getElementById("default-manager");
  const popup = document.getElementById("default-manager-popup");
  const list = document.getElementById("manager-list");
  const count = document.getElementById("manager-count");
  const countLabel = document.getElementById("manager-count-label");
  const managerState = document.getElementById("manager-state");
  const refreshButton = document.getElementById("refresh-managers");
  const defaultLock = document.getElementById("default-manager-lock");
  const customError = document.getElementById("custom-config-error");
  const customErrorMessage = document.getElementById("custom-config-error-message");
  const customBlocked = Boolean(snapshot?.customDownloadersError);

  setLocalized(count, "downloadit-manager-count", {
    count: snapshot?.detectedManagerCount || 0,
  });
  setLocalized(countLabel, "downloadit-manager-count-label", {
    count: snapshot?.detectedManagerCount || 0,
  });

  const keys = available.map(downloader => downloader.key);
  const managersChanged = renderedManagerKeys === null ||
    renderedManagerKeys.length !== keys.length ||
    renderedManagerKeys.some((key, index) => key !== keys[index]);
  if (managersChanged) {
    popup.replaceChildren();
    if (!available.length) {
      const item = createXULElement(document, "menuitem");
      setLocalized(item, "downloadit-no-manager-option");
      item.setAttribute("value", "");
      popup.append(item);
    } else {
      for (const downloader of available) {
        const item = createXULElement(document, "menuitem");
        item.setAttribute("label", downloader.name);
        item.setAttribute("value", downloader.key);
        item.setAttribute("manager", downloader.key);
        item.downloadItManagerKey = downloader.key;
        if (downloader.custom) {
          setLocalized(item, "downloadit-custom-downloader-menu-label", {
            name: downloader.name,
          });
        }
        popup.append(item);
      }
    }
    renderedManagerKeys = [...keys];
    Promise.resolve(document.l10n?.translateFragment?.(popup)).catch(console.error);
  }

  const selected = available.find(
    downloader => downloader.key === state.draft?.defaultManager,
  ) || available[0];
  const selectedItem = [...popup.children].find(
    item => item.downloadItManagerKey === selected?.key,
  ) || null;
  select.selectedItem = selectedItem;
  if (!selectedItem) {
    select.removeAttribute("label");
    select.removeAttribute("value");
    select.removeAttribute("manager");
  }
  if (state.draft && !available.some(
    downloader => downloader.key === state.draft.defaultManager
  )) {
    state.draft.defaultManager = selected?.key || "";
  }
  select.disabled = !available.length || state.busy || Boolean(snapshot?.defaultManagerLocked);
  refreshButton.disabled = state.busy || !snapshot?.serviceReady;
  refreshButton.querySelector(".button-glyph").textContent =
    state.scanState === "loading" ? "..." : "\u21bb";
  defaultLock.hidden = !snapshot?.defaultManagerLocked;

  managerState.className = "status-strip-state";
  if (state.scanState === "loading") {
    setLocalized(managerState, "downloadit-detection-loading");
  } else if (state.scanState === "error") {
    setLocalized(managerState, "downloadit-detection-error", { error: state.scanMessage });
    managerState.classList.add("is-error");
  } else if (state.scanState === "success") {
    setLocalized(managerState, "downloadit-detection-success", {
      count: snapshot?.detectedManagerCount || 0,
    });
    managerState.classList.add("is-success");
  } else if (!(snapshot?.detectedManagerCount || 0)) {
    setLocalized(managerState, "downloadit-no-managers");
  } else {
    setLocalized(managerState, "downloadit-detection-idle");
  }

  customError.hidden = !customBlocked;
  if (customBlocked) {
    const error = snapshot.customDownloadersError;
    const errorMessageId = CUSTOM_ERROR_MESSAGES[error.code];
    if (errorMessageId) {
      setLocalized(customErrorMessage, errorMessageId, error.args || null);
    } else {
      setLocalized(customErrorMessage, "downloadit-custom-config-load-error", {
        error: error.message,
      });
    }
  }
  document.getElementById("add-custom-downloader").disabled =
    state.busy || customBlocked || !state.service;
  document.getElementById("reload-custom-downloaders").disabled =
    state.busy || !state.service;
  document.getElementById("retry-custom-downloaders").disabled =
    state.busy || !state.service;
  document.getElementById("reset-custom-downloaders").disabled =
    state.busy || !state.service;

  list.replaceChildren();
  if (!downloaders.length) {
    const empty = document.createElement("li");
    empty.className = "empty-row";
    const mark = document.createElement("span");
    mark.className = "empty-mark";
    mark.textContent = "--";
    const message = document.createElement("span");
    empty.append(mark, message);
    list.append(empty);
    setLocalized(message, "downloadit-no-downloaders");
    return;
  }

  for (const downloader of downloaders) {
    const row = document.createElement("li");
    row.className = `manager-row${downloader.available ? "" : " is-unavailable"}`;
    const dot = document.createElement("span");
    dot.className = `manager-dot ${downloader.available ? "is-ready" : "is-error"}`;
    dot.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.className = "manager-name";
    name.textContent = downloader.name;
    row.append(dot, name);

    if (downloader.custom) {
      const customBadge = document.createElement("span");
      customBadge.className = "manager-badge is-custom";
      setLocalized(customBadge, "downloadit-manager-custom");
      row.append(customBadge);
    }
    if (downloader.key === state.draft?.defaultManager && downloader.available) {
      const badge = document.createElement("span");
      badge.className = "manager-badge";
      setLocalized(badge, "downloadit-manager-default");
      row.append(badge);
    }
    if (!downloader.available) {
      const status = document.createElement("span");
      status.className = "manager-status";
      setLocalized(status, downloader.enabled
        ? "downloadit-manager-unavailable"
        : "downloadit-manager-disabled");
      row.append(status);
    }
    if (downloader.custom) {
      const actions = document.createElement("span");
      actions.className = "manager-actions";
      actions.append(
        customActionButton(
          downloader.enabled ? "downloadit-disable-custom" : "downloadit-enable-custom",
          "data-toggle-custom",
          downloader.ref.id,
          downloader.enabled ? "\u25cb" : "\u25cf",
          downloader.name,
        ),
        customActionButton("downloadit-edit-custom", "data-edit-custom", downloader.ref.id, "\u270e", downloader.name),
        customActionButton("downloadit-remove-custom", "data-remove-custom", downloader.ref.id, "\u00d7", downloader.name),
      );
      for (const button of actions.querySelectorAll("button")) {
        button.disabled = state.busy || customBlocked;
      }
      row.append(actions);
    }
    list.append(row);
  }
}

function customActionButton(messageId, attribute, id, glyph, name) {
  const button = document.createElement("button");
  button.className = "icon-button";
  button.type = "button";
  button.setAttribute(attribute, id);
  button.textContent = glyph;
  setLocalized(button, messageId, { name });
  return button;
}

function renderPrivacy() {
  const snapshot = state.snapshot;
  const sendCookies = document.getElementById("send-cookies");
  const cookieLock = document.getElementById("cookie-lock");
  sendCookies.checked = Boolean(state.draft && !state.draft.omitCookies);
  sendCookies.disabled = state.busy || !snapshot || Boolean(snapshot.omitCookiesLocked);
  cookieLock.hidden = !snapshot?.omitCookiesLocked;
}

function renderAutoExtensions() {
  const snapshot = state.snapshot;
  const extensions = state.draft?.autoExtensions || snapshot?.autoExtensions || [];
  const list = document.getElementById("auto-extension-list");
  const clearButton = document.getElementById("clear-auto-extensions");
  const lock = document.getElementById("auto-extension-lock");
  list.replaceChildren();
  if (!extensions.length) {
    const empty = document.createElement("li");
    empty.className = "empty-row";
    const mark = document.createElement("span");
    mark.className = "empty-mark";
    mark.textContent = "--";
    const message = document.createElement("span");
    empty.append(mark, message);
    list.append(empty);
    setLocalized(message, "downloadit-no-auto-extensions");
  } else {
    for (const extension of extensions) {
      const row = document.createElement("li");
      row.className = "auto-extension-row";
      const name = document.createElement("code");
      name.className = "auto-extension-name";
      name.textContent = `.${extension}`;
      const remove = document.createElement("button");
      remove.className = "icon-button";
      remove.type = "button";
      remove.dataset.removeExtension = extension;
      remove.textContent = "\u00d7";
      setLocalized(remove, "downloadit-remove-extension", { extension: `.${extension}` });
      row.append(name, remove);
      list.append(row);
    }
  }
  const locked = Boolean(snapshot?.autoExtensionsLocked);
  clearButton.disabled = locked || state.busy || !extensions.length;
  lock.hidden = !locked;
  for (const button of list.querySelectorAll("[data-remove-extension]")) {
    button.disabled = locked || state.busy;
  }
}

function renderAbout() {
  const snapshot = state.snapshot;
  document.getElementById("binary-path").textContent = snapshot?.binaryPath || "--";
}

function errorText(error) {
  return String(error?.message || error || "");
}

function localizedError(error) {
  if (CUSTOM_ERROR_MESSAGES[error?.code]) {
    return localizedMessage(CUSTOM_ERROR_MESSAGES[error.code], error.args || null);
  }
  const message = errorText(error);
  if (/default download manager preference is locked/i.test(message)) {
    return localizedMessage("downloadit-error-locked-default");
  }
  if (/cookie preference is locked/i.test(message)) {
    return localizedMessage("downloadit-error-locked-cookies");
  }
  if (/automatic extension preference is locked/i.test(message)) {
    return localizedMessage("downloadit-error-locked-extensions");
  }
  if (/unsupported download manager/i.test(message)) {
    return localizedMessage("downloadit-error-unsupported-manager");
  }
  return message
    ? localizedMessage("downloadit-error-unexpected", { error: message })
    : localizedMessage("downloadit-error-service");
}

async function formatLocalizedError(error) {
  const message = localizedError(error);
  return message.args == null
    ? document.l10n.formatValue(message.id)
    : document.l10n.formatValue(message.id, message.args);
}

async function refreshManagers() {
  if (state.busy || !state.service || !state.snapshot?.serviceReady) {
    return;
  }
  state.scanState = "loading";
  state.scanMessage = "";
  clearFeedback();
  render();
  try {
    await state.service.refreshManagers({ persistDefault: false });
    state.snapshot = state.service.readSettings();
    syncUntouchedDefaultManager();
    state.scanState = "success";
  } catch (error) {
    state.scanState = "error";
    state.scanMessage = errorText(error);
  }
  renderedManagerKeys = null;
  render();
}

async function reloadCustomDownloaders() {
  if (!state.service || state.busy) {
    return;
  }
  if (customDownloadersAreDirty()) {
    const message = await document.l10n.formatValue("downloadit-confirm-reload-custom");
    if (!window.confirm(message)) {
      return;
    }
  }
  state.busy = true;
  render();
  try {
    state.snapshot = await state.service.reloadCustomDownloaders();
    state.initial.customDownloaders = clone(state.snapshot.customDownloaders);
    state.draft.customDownloaders = clone(state.snapshot.customDownloaders);
    syncUntouchedDefaultManager();
    renderedManagerKeys = null;
    setFeedback(localizedMessage("downloadit-custom-reloaded"), "success");
  } catch (error) {
    setFeedback(localizedError(error), "error");
  } finally {
    state.busy = false;
  }
  render();
}

async function resetCustomDownloaders() {
  const message = await document.l10n.formatValue("downloadit-confirm-reset-custom");
  if (!window.confirm(message)) {
    return;
  }
  state.busy = true;
  render();
  try {
    state.snapshot = await state.service.resetCustomDownloaders();
    state.initial.customDownloaders = clone(state.snapshot.customDownloaders);
    state.draft.customDownloaders = clone(state.snapshot.customDownloaders);
    syncUntouchedDefaultManager();
    renderedManagerKeys = null;
    setFeedback(localizedMessage("downloadit-custom-reset"), "success");
  } catch (error) {
    setFeedback(localizedError(error), "error");
  } finally {
    state.busy = false;
  }
  render();
}

function openCustomEditor(id = "") {
  const existing = state.draft.customDownloaders.downloaders.find(
    downloader => downloader.id === id,
  );
  const downloader = existing ? clone(existing) : {
    id: state.service.createCustomDownloaderId(),
    name: "",
    enabled: true,
    type: "command",
    startHidden: true,
    command: { executablePath: "", argumentsTemplate: "[URL]" },
  };
  state.editor = { existingId: existing?.id || "", downloader };
  state.editorReturnFocus = document.activeElement;
  document.getElementById("custom-name").value = downloader.name;
  document.getElementById("custom-enabled").checked = downloader.enabled;
  document.getElementById("custom-start-hidden").checked =
    downloader.startHidden !== false;
  document.getElementById("custom-command-path").value =
    downloader.command?.executablePath || "";
  document.getElementById("custom-command-template").value =
    downloader.command?.argumentsTemplate || "[URL]";
  document.getElementById("custom-aria2-url").value =
    downloader.aria2?.rpcUrl || "http://127.0.0.1:6800/jsonrpc";
  document.getElementById("custom-aria2-secret").value = downloader.aria2?.secret || "";
  document.getElementById("custom-aria2-directory").value =
    downloader.aria2?.downloadDirectory || "";
  document.getElementById("custom-aria2-autostart").checked =
    Boolean(downloader.aria2?.autoStart);
  document.getElementById("custom-aria2-path").value =
    downloader.aria2?.executablePath || "";
  document.getElementById("custom-aria2-configuration").value =
    downloader.aria2?.configurationPath || "";
  document.getElementById("custom-aria2-arguments").value =
    downloader.aria2?.startupArguments || "";
  document.getElementById("aria2-test-state").textContent = "";
  document.getElementById("custom-editor-error").hidden = true;
  setLocalized(
    document.getElementById("custom-editor-title"),
    existing ? "downloadit-custom-editor-edit-title" : "downloadit-custom-editor-add-title",
  );
  setEditorType(downloader.type);
  document.getElementById("custom-downloader-editor").hidden = false;
  document.getElementById("app").inert = true;
  document.getElementById("custom-name").focus();
}

function closeCustomEditor() {
  state.editor = null;
  document.getElementById("custom-downloader-editor").hidden = true;
  document.getElementById("app").inert = false;
  if (state.editorReturnFocus?.isConnected) {
    state.editorReturnFocus.focus();
  }
  state.editorReturnFocus = null;
}

function trapEditorFocus(event) {
  const dialog = document.querySelector(".editor-dialog");
  const controls = [...dialog.querySelectorAll(
    "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
  )].filter(element => !element.closest("[hidden]"));
  if (!controls.length) {
    event.preventDefault();
    return;
  }
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function setEditorType(type) {
  if (!state.editor || !["command", "aria2"].includes(type)) {
    return;
  }
  state.editor.downloader.type = type;
  renderEditorType();
}

function renderEditorType() {
  const type = state.editor?.downloader.type || "command";
  for (const button of document.querySelectorAll("[data-custom-type]")) {
    const active = button.dataset.customType === type;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-checked", String(active));
  }
  document.getElementById("custom-command-fields").hidden = type !== "command";
  document.getElementById("custom-aria2-fields").hidden = type !== "aria2";
}

function collectEditorDownloader() {
  const common = {
    id: state.editor.downloader.id,
    name: document.getElementById("custom-name").value.trim(),
    enabled: document.getElementById("custom-enabled").checked,
    type: state.editor.downloader.type,
    startHidden: document.getElementById("custom-start-hidden").checked,
  };
  if (common.type === "command") {
    return {
      ...common,
      command: {
        executablePath: state.service.normalizeExecutablePathForStorage(
          document.getElementById("custom-command-path").value.trim(),
        ),
        argumentsTemplate: document.getElementById("custom-command-template").value,
      },
    };
  }
  return {
    ...common,
    aria2: {
      rpcUrl: document.getElementById("custom-aria2-url").value.trim(),
      secret: document.getElementById("custom-aria2-secret").value,
      executablePath: state.service.normalizeExecutablePathForStorage(
        document.getElementById("custom-aria2-path").value.trim(),
      ),
      configurationPath: state.service.normalizeCustomFilePathForStorage(
        document.getElementById("custom-aria2-configuration").value.trim(),
      ),
      autoStart: document.getElementById("custom-aria2-autostart").checked,
      startupArguments: document.getElementById("custom-aria2-arguments").value,
      downloadDirectory: document.getElementById("custom-aria2-directory").value.trim(),
    },
  };
}

function saveCustomEditor() {
  try {
    const downloader = collectEditorDownloader();
    const documentValue = clone(state.draft.customDownloaders);
    const index = documentValue.downloaders.findIndex(
      entry => entry.id === state.editor.existingId,
    );
    if (index >= 0) {
      documentValue.downloaders[index] = downloader;
    } else {
      documentValue.downloaders.push(downloader);
    }
    state.draft.customDownloaders = validateCustomDownloaderDocument(documentValue);
  } catch (error) {
    const message = localizedError(error);
    const container = document.getElementById("custom-editor-error");
    container.hidden = false;
    setLocalizedMessage(document.getElementById("custom-editor-error-message"), message);
    return;
  }
  closeCustomEditor();
  clearFeedback();
  renderedManagerKeys = null;
  render();
}

async function removeCustomDownloader(id) {
  const downloader = state.draft.customDownloaders.downloaders.find(
    entry => entry.id === id,
  );
  if (!downloader) {
    return;
  }
  const message = await document.l10n.formatValue(
    "downloadit-confirm-remove-custom",
    { name: downloader.name },
  );
  if (!window.confirm(message)) {
    return;
  }
  state.draft.customDownloaders.downloaders =
    state.draft.customDownloaders.downloaders.filter(entry => entry.id !== id);
  renderedManagerKeys = null;
  clearFeedback();
  render();
}

function toggleCustomDownloader(id) {
  const downloader = state.draft.customDownloaders.downloaders.find(
    entry => entry.id === id,
  );
  if (!downloader) {
    return;
  }
  downloader.enabled = !downloader.enabled;
  renderedManagerKeys = null;
  clearFeedback();
  render();
}

async function browseExecutable(inputId) {
  return browseLocalFile(inputId, {
    titleId: "downloadit-browse-executable-title",
    application: true,
  });
}

async function browseAria2Configuration() {
  return browseLocalFile("custom-aria2-configuration", {
    titleId: "downloadit-browse-aria2-configuration-title",
    filterId: "downloadit-aria2-configuration-filter",
    filter: "*.conf",
  });
}

function clearFilePath(inputId) {
  document.getElementById(inputId).value = "";
}

async function browseLocalFile(inputId, {
  titleId,
  application = false,
  filterId = "",
  filter = "",
}) {
  const title = await document.l10n.formatValue(titleId);
  const picker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
  const pickerParent = !(
    "inIsolatedMozBrowser" in window.browsingContext.originAttributes
  ) ? window.browsingContext : window;
  picker.init(pickerParent, title, Ci.nsIFilePicker.modeOpen);
  if (application) {
    picker.appendFilters(Ci.nsIFilePicker.filterApps);
  } else if (filterId && filter) {
    picker.appendFilter(await document.l10n.formatValue(filterId), filter);
  }
  picker.appendFilters(Ci.nsIFilePicker.filterAll);
  const currentPath = document.getElementById(inputId).value;
  try {
    picker.displayDirectory = state.service.getConfigurationDirectoryFile();
    if (currentPath) {
      const current = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      current.initWithPath(state.service.resolveCustomFilePath(currentPath));
      picker.displayDirectory = current.parent;
    }
  } catch {}
  const result = await new Promise(resolve => picker.open(resolve));
  if (result === Ci.nsIFilePicker.returnOK && picker.file) {
    document.getElementById(inputId).value =
      state.service.normalizeCustomFilePathForStorage(picker.file);
  }
}

function insertCommandPlaceholder() {
  const name = document.getElementById("custom-command-placeholder").value;
  const input = document.getElementById("custom-command-template");
  const placeholder = `[${name}]`;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.setRangeText(placeholder, start, end, "end");
  input.focus();
}

function applyCommandTemplatePreset(event) {
  const template = COMMAND_TEMPLATE_PRESETS[event.target.value];
  if (!template) {
    return;
  }
  const input = document.getElementById("custom-command-template");
  input.value = template;
  event.target.value = "";
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

async function testAria2() {
  const button = document.getElementById("test-aria2");
  const output = document.getElementById("aria2-test-state");
  button.disabled = true;
  output.className = "";
  setLocalized(output, "downloadit-aria2-testing");
  try {
    const downloader = collectEditorDownloader();
    const result = await state.service.testAria2Configuration(downloader.aria2);
    output.className = "is-success";
    setLocalized(output, "downloadit-aria2-test-success", {
      version: result.version || "?",
    });
  } catch (error) {
    output.className = "is-error";
    setLocalized(output, "downloadit-aria2-test-failed", {
      error: await formatLocalizedError(error),
    });
  } finally {
    button.disabled = false;
  }
}

async function applySettings() {
  if (state.busy || !state.service || !state.draft) {
    return;
  }
  state.busy = true;
  clearFeedback();
  render();
  try {
    const payload = clone(state.draft);
    payload.defaultManager = state.defaultManagerTouched
      ? state.draft.defaultManager
      : null;
    if (state.snapshot.customDownloadersError) {
      payload.customDownloaders = null;
    }
    const nextSnapshot = await state.service.applySettings(payload);
    state.snapshot = nextSnapshot;
    state.initial = createSettingsState(nextSnapshot);
    state.draft = createSettingsState(nextSnapshot);
    state.defaultManagerTouched = false;
    state.scanState = "idle";
    renderedManagerKeys = null;
    setFeedback(localizedMessage("downloadit-applied"), "success");
  } catch (error) {
    setFeedback(localizedError(error), "error");
  } finally {
    state.busy = false;
  }
  render();
}

function syncUntouchedDefaultManager() {
  if (!state.defaultManagerTouched && state.snapshot && state.initial && state.draft) {
    state.initial.defaultManager = state.snapshot.defaultManager;
    state.draft.defaultManager = state.snapshot.defaultManager;
  }
}

async function init() {
  try {
    await localizationReady;
    const placeholderSelect = document.getElementById("custom-command-placeholder");
    for (const name of COMMAND_PLACEHOLDERS) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      placeholderSelect.append(option);
    }
    bindEvents();
    state.service = getActiveService();
    if (state.service) {
      state.snapshot = state.service.readSettings();
      state.initial = createSettingsState(state.snapshot);
      state.draft = createSettingsState(state.snapshot);
    }
    render();
  } catch (error) {
    console.error("DownloadIt: settings initialization failed", error);
  }
}

window.addEventListener("DOMContentLoaded", init, { once: true });
})();

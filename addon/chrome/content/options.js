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
  BUILT_IN_PROTOCOLS,
  COMMAND_PLACEHOLDERS,
  COMMAND_TEMPLATE_PRESETS,
  DOWNLOADER_CAPABILITY_KEYS,
  getCustomDownloaderCapabilities,
  JDOWNLOADER_PROVIDER,
  validateCustomDownloaderDocument,
} = ChromeUtils.importESModule(
  "chrome://downloadit/content/DownloadItDownloaders.sys.mjs",
);
const { validateLinkGroupSettings } = ChromeUtils.importESModule(
  "chrome://downloadit/content/DownloadItLinks.sys.mjs",
);
const {
  isBuiltInAutoCaptureDeny,
  listAutoCaptureExtensions,
  normalizeAutoExtensions,
  updateAutoCaptureRule,
} = ChromeUtils.importESModule(
  "chrome://downloadit/content/DownloadItAutoCapture.sys.mjs",
);
const localizationReady = initializeDownloadItLocalization(window);
const DEVELOPER_MODE_DOUBLE_CLICKS = 6;
const DEVELOPER_MODE_GESTURE_TIMEOUT_MS = 4000;

const SECTION_META = {
  managers: [
    "downloadit-manager-kicker",
    "downloadit-manager-title",
    "downloadit-manager-description",
  ],
  "auto-capture": [
    "downloadit-auto-capture-kicker",
    "downloadit-auto-capture-title",
    "downloadit-auto-capture-description",
  ],
  privacy: [
    "downloadit-privacy-kicker",
    "downloadit-privacy-title",
    "downloadit-privacy-description",
  ],
  "link-groups": [
    "downloadit-link-groups-kicker",
    "downloadit-link-groups-title",
    "downloadit-link-groups-description",
  ],
  mirrors: [
    "downloadit-mirrors-kicker",
    "downloadit-mirrors-title",
    "downloadit-mirrors-description",
  ],
  about: [
    "downloadit-about-kicker",
    "downloadit-about-title",
    "downloadit-about-description",
  ],
};

const BUILT_IN_GROUP_MESSAGE_IDS = {
  image: "downloadit-links-type-image",
  video: "downloadit-links-type-video",
  audio: "downloadit-links-type-audio",
  document: "downloadit-links-type-document",
  archive: "downloadit-links-type-archive",
  program: "downloadit-links-type-program",
};

const LINK_GROUP_ERROR_MESSAGES = {
  "settings-invalid": "downloadit-error-link-group-settings",
  "group-invalid": "downloadit-error-link-group-settings",
  "built-in-invalid": "downloadit-error-link-group-settings",
  "built-in-missing": "downloadit-error-link-group-settings",
  "key-required": "downloadit-error-link-group-key-required",
  "key-invalid": "downloadit-error-link-group-key-invalid",
  "key-duplicate": "downloadit-error-link-group-key-duplicate",
  "key-reserved": "downloadit-error-link-group-key-reserved",
  "name-required": "downloadit-error-link-group-name-required",
  "name-too-long": "downloadit-error-link-group-name-too-long",
  "extensions-invalid": "downloadit-error-link-group-extensions-invalid",
  "extensions-required": "downloadit-error-link-group-extensions-required",
  "extension-invalid": "downloadit-error-link-group-extension-invalid",
  "extension-duplicate": "downloadit-error-link-group-extension-duplicate",
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
  "auto-capture-config-blocked": "downloadit-error-auto-capture-config-blocked",
  "aria2-unavailable": "downloadit-error-aria2-unavailable",
  "aria2-http-error": "downloadit-error-aria2-http",
  "aria2-response-invalid": "downloadit-error-aria2-response",
  "aria2-rpc-error": "downloadit-error-aria2-rpc",
  "jdownloader-endpoint-invalid": "downloadit-error-jdownloader-endpoint",
  "jdownloader-unavailable": "downloadit-error-jdownloader-unavailable",
  "jdownloader-discovery-invalid": "downloadit-error-jdownloader-discovery",
  "jdownloader-http-error": "downloadit-error-jdownloader-http",
  "jdownloader-launch-path-invalid": "downloadit-error-jdownloader-path",
  "jdownloader-launch-failed": "downloadit-error-jdownloader-launch",
  "jdownloader-start-timeout": "downloadit-error-jdownloader-start-timeout",
  "jdownloader-submit-failed": "downloadit-error-jdownloader-submit",
  "jdownloader-mixed-post-data": "downloadit-error-jdownloader-mixed-post",
};

const MIRROR_ERROR_MESSAGES = {
  "mirror-settings-invalid": "downloadit-error-mirror-settings",
  "mirror-settings-version": "downloadit-error-mirror-version",
  "mirror-adapter-unknown": "downloadit-error-mirror-adapter",
  "mirror-adapter-invalid": "downloadit-error-mirror-adapter",
  "mirror-endpoint-invalid": "downloadit-error-mirror-endpoint",
  "mirror-endpoint-insecure": "downloadit-error-mirror-insecure",
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
  mirrorValidation: null,
  editor: null,
  linkGroupEditor: null,
  editorReturnFocus: null,
  defaultManagerTouched: false,
};

let renderedManagerKeys = null;
let observedBuiltInRefresh = null;
let developerModeDoubleClicks = 0;
let developerModeLastGesture = 0;

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
    autoStartTasks: snapshot.autoStartTasks,
    builtInProtocols: Object.fromEntries(
      snapshot.builtInProtocols.map(protocol => [
        protocol.id,
        clone(protocol.settings),
      ]),
    ),
    idmBridgeEnabled: snapshot.idmBridgeEnabled,
    autoCaptureRules: clone(snapshot.autoCaptureRules),
    linkGroups: clone(snapshot.linkGroups),
    mirrorSettings: clone(snapshot.mirrorSettings),
    customDownloaders: clone(snapshot.customDownloaders),
  };
}

function bindEvents() {
  document.getElementById("developer-mode-trigger").addEventListener(
    "dblclick",
    activateDeveloperModeFromGesture,
  );
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
  document.getElementById("auto-start-tasks").addEventListener("change", event => {
    state.draft.autoStartTasks = event.target.checked;
    clearFeedback();
    render();
  });
  document.getElementById("idm-bridge").addEventListener("change", event => {
    state.draft.idmBridgeEnabled = event.target.checked;
    clearFeedback();
    render();
  });
  const mirrorList = document.getElementById("mirror-adapter-list");
  mirrorList.addEventListener("change", event => {
    const toggle = event.target.closest("[data-mirror-enabled]");
    if (!toggle || !state.draft?.mirrorSettings) {
      return;
    }
    const settings = state.draft.mirrorSettings.adapters[toggle.dataset.mirrorEnabled];
    if (!settings) {
      return;
    }
    settings.enabled = toggle.checked;
    clearFeedback();
    validateMirrorDraft();
    render();
  });
  mirrorList.addEventListener("input", event => {
    const input = event.target.closest("[data-mirror-endpoint]");
    if (!input || !state.draft?.mirrorSettings) {
      return;
    }
    const settings = state.draft.mirrorSettings.adapters[input.dataset.mirrorEndpoint];
    if (!settings) {
      return;
    }
    settings.endpoint = input.value;
    clearFeedback();
    validateMirrorDraft();
    renderMirrorValidation();
    renderActionState();
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
  document.getElementById("retry-auto-capture-rules").addEventListener(
    "click",
    reloadAutoCaptureRules,
  );
  document.getElementById("reset-auto-capture-rules").addEventListener(
    "click",
    resetAutoCaptureRules,
  );
  document.getElementById("add-download-tool").addEventListener(
    "click",
    () => openDownloadToolEditor(),
  );
  document.getElementById("manager-list").addEventListener("click", event => {
    const configureBuiltIn = event.target.closest("[data-configure-built-in]");
    const removeBuiltIn = event.target.closest("[data-remove-built-in]");
    const edit = event.target.closest("[data-edit-custom]");
    const remove = event.target.closest("[data-remove-custom]");
    const toggle = event.target.closest("[data-toggle-custom]");
    if (configureBuiltIn) {
      openDownloadToolEditor(
        "builtin",
        configureBuiltIn.dataset.configureBuiltIn,
      );
    } else if (removeBuiltIn) {
      removeBuiltInDownloader(removeBuiltIn.dataset.removeBuiltIn);
    } else if (edit) {
      openDownloadToolEditor("custom", edit.dataset.editCustom);
    } else if (remove) {
      removeCustomDownloader(remove.dataset.removeCustom);
    } else if (toggle) {
      toggleCustomDownloader(toggle.dataset.toggleCustom);
    }
  });
  for (const disposition of ["allow", "deny"]) {
    document.getElementById(`add-auto-${disposition}`).addEventListener(
      "click",
      () => addAutoCaptureRules(disposition),
    );
    document.getElementById(`auto-${disposition}-input`).addEventListener(
      "keydown",
      event => {
        if (event.key === "Enter") {
          event.preventDefault();
          addAutoCaptureRules(disposition);
        }
      },
    );
    document.getElementById(`clear-auto-${disposition}`).addEventListener(
      "click",
      () => clearAutoCaptureRules(disposition),
    );
    document.getElementById(`auto-${disposition}-list`).addEventListener(
      "click",
      removeAutoCaptureRule,
    );
  }
  document.getElementById("add-custom-link-group").addEventListener(
    "click",
    () => openLinkGroupEditor(),
  );
  for (const id of ["built-in-link-group-list", "custom-link-group-list"]) {
    const list = document.getElementById(id);
    list.addEventListener("change", event => {
      const toggle = event.target.closest("[data-toggle-link-group]");
      if (toggle) {
        toggleLinkGroup(toggle.dataset.toggleLinkGroup, toggle.checked);
      }
    });
    list.addEventListener("click", event => {
      const edit = event.target.closest("[data-edit-link-group]");
      const remove = event.target.closest("[data-remove-link-group]");
      if (edit) {
        openLinkGroupEditor(edit.dataset.editLinkGroup);
      } else if (remove) {
        removeCustomLinkGroup(remove.dataset.removeLinkGroup);
      }
    });
  }
  document.getElementById("link-group-editor-save").addEventListener(
    "click",
    saveLinkGroupEditor,
  );
  for (const id of ["link-group-editor-close", "link-group-editor-cancel"]) {
    document.getElementById(id).addEventListener("click", closeLinkGroupEditor);
  }
  document.getElementById("link-group-editor").addEventListener("click", event => {
    if (event.target.id === "link-group-editor") {
      closeLinkGroupEditor();
    }
  });

  for (const button of document.querySelectorAll("[data-custom-type]")) {
    button.addEventListener("click", () => setEditorType(button.dataset.customType));
  }
  for (const button of document.querySelectorAll("[data-tool-kind]")) {
    button.addEventListener("click", () => setEditorKind(button.dataset.toolKind));
  }
  document.getElementById("built-in-protocol").addEventListener(
    "change",
    event => {
      if (!state.editor) {
        return;
      }
      state.editor.builtInProtocol = event.target.value;
      renderDownloadToolEditor();
    },
  );
  document.getElementById("jdownloader-endpoint").addEventListener(
    "input",
    renderJDownloaderEditorState,
  );
  document.getElementById("jdownloader-auto-launch").addEventListener(
    "change",
    renderJDownloaderEditorState,
  );
  document.getElementById("browse-jdownloader-path").addEventListener(
    "click",
    browseJDownloaderPath,
  );
  document.getElementById("clear-jdownloader-path").addEventListener(
    "click",
    clearJDownloaderPath,
  );
  document.getElementById("test-jdownloader").addEventListener(
    "click",
    testJDownloader,
  );
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
  document.getElementById("tool-editor-save").addEventListener(
    "click",
    saveDownloadToolEditor,
  );
  for (const id of ["tool-editor-close", "tool-editor-cancel"]) {
    document.getElementById(id).addEventListener("click", closeDownloadToolEditor);
  }
  document.getElementById("download-tool-editor").addEventListener(
    "click",
    event => {
      if (event.target.id === "download-tool-editor") {
        closeDownloadToolEditor();
      }
    },
  );
  document.addEventListener("keydown", event => {
    if (!state.editor && !state.linkGroupEditor) {
      return;
    }
    if (event.key === "Escape") {
      if (state.linkGroupEditor) {
        closeLinkGroupEditor();
      } else {
        closeDownloadToolEditor();
      }
    } else if (event.key === "Tab") {
      trapEditorFocus(
        event,
        state.linkGroupEditor ? "link-group-editor" : "download-tool-editor",
      );
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

function activateDeveloperModeFromGesture(event) {
  event.preventDefault();
  if (state.snapshot?.developerMode) {
    state.section = "mirrors";
    render();
    return;
  }

  const now = Date.now();
  if (now - developerModeLastGesture > DEVELOPER_MODE_GESTURE_TIMEOUT_MS) {
    developerModeDoubleClicks = 0;
  }
  developerModeLastGesture = now;
  developerModeDoubleClicks++;
  if (developerModeDoubleClicks < DEVELOPER_MODE_DOUBLE_CLICKS) {
    return;
  }

  developerModeDoubleClicks = 0;
  developerModeLastGesture = 0;
  if (!state.service?.activateDeveloperMode()) {
    return;
  }
  state.snapshot.developerMode = true;
  state.section = "mirrors";
  render();
}

function renderNavigation() {
  const developerMode = Boolean(state.snapshot?.developerMode);
  const navigation = document.querySelector(".section-nav");
  const mirrorButton = navigation.querySelector('[data-section="mirrors"]');
  const visibleSections = developerMode
    ? ["managers", "auto-capture", "link-groups", "mirrors", "privacy", "about"]
    : ["managers", "auto-capture", "link-groups", "privacy", "about"];

  mirrorButton.hidden = !developerMode;
  navigation.classList.toggle("has-developer-mode", developerMode);
  document.body.classList.toggle("has-developer-mode", developerMode);
  if (!developerMode && state.section === "mirrors") {
    state.section = "managers";
  }
  for (const [index, section] of visibleSections.entries()) {
    navigation.querySelector(`[data-section="${section}"] .nav-number`).textContent =
      String(index + 1).padStart(2, "0");
  }
}

function render() {
  validateMirrorDraft();
  renderNavigation();
  document.body.dataset.activeSection = state.section;
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
  renderTaskStartSettings();
  renderAutoCaptureRules();
  renderLinkGroups();
  renderMirrors();
  renderPrivacy();
  renderAbout();

  renderActionState();
}

function renderActionState() {
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
  applyButton.disabled = !dirty || state.busy || !state.service ||
    Boolean(state.mirrorValidation);
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
  const detected = (state.snapshot?.downloaders || [])
    .filter(downloader =>
      !downloader.custom &&
      downloader.ref?.provider !== JDOWNLOADER_PROVIDER
    );
  const jDownloaderDraft =
    state.draft?.builtInProtocols?.[JDOWNLOADER_PROVIDER];
  if (jDownloaderDraft?.enabled) {
    const jDownloader = state.service.createJDownloaderDescriptor(jDownloaderDraft);
    const nativeIndex = detected.findIndex(
      downloader => downloader.ref?.provider === "native",
    );
    detected.splice(nativeIndex < 0 ? detected.length : nativeIndex, 0, jDownloader);
  }
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
      capabilities: getCustomDownloaderCapabilities(entry),
    };
  });
  return [...detected, ...custom];
}

function renderTaskStartSettings() {
  const snapshot = state.snapshot;
  const autoStartTasks = document.getElementById("auto-start-tasks");
  const autoStartTasksLock = document.getElementById("auto-start-tasks-lock");

  autoStartTasks.checked = Boolean(state.draft?.autoStartTasks);
  autoStartTasks.disabled = state.busy || !snapshot ||
    Boolean(snapshot?.autoStartTasksLocked);
  autoStartTasksLock.hidden = !snapshot?.autoStartTasksLocked;
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
  document.getElementById("add-download-tool").disabled =
    state.busy || !state.service;
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
    const identity = document.createElement("span");
    identity.className = "manager-identity";
    const name = document.createElement("span");
    name.className = "manager-name";
    name.textContent = downloader.name;
    identity.append(name, createManagerCapabilities(downloader.capabilities));
    row.append(dot, identity);

    if (downloader.ref?.provider === JDOWNLOADER_PROVIDER) {
      const builtInBadge = document.createElement("span");
      builtInBadge.className = "manager-badge is-built-in";
      setLocalized(builtInBadge, "downloadit-manager-built-in");
      row.append(builtInBadge);
    } else if (downloader.custom) {
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
    if (downloader.ref?.provider === JDOWNLOADER_PROVIDER) {
      const actions = document.createElement("span");
      actions.className = "manager-actions";
      const configure = customActionButton(
        "downloadit-configure-built-in",
        "data-configure-built-in",
        downloader.ref.id,
        "\u2699",
        downloader.name,
      );
      configure.disabled = state.busy || !state.service;
      const remove = customActionButton(
        "downloadit-remove-built-in",
        "data-remove-built-in",
        downloader.ref.id,
        "\u00d7",
        downloader.name,
      );
      const protocol = getBuiltInProtocolSnapshot(downloader.ref.id);
      remove.disabled = state.busy || Boolean(protocol?.locks.enabled) || Boolean(
        state.snapshot?.defaultManagerLocked &&
        downloader.key === state.draft?.defaultManager
      );
      actions.append(configure, remove);
      row.append(actions);
    } else if (downloader.custom) {
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

function createManagerCapabilities(capabilities = {}) {
  const container = document.createElement("span");
  container.className = "manager-capabilities";
  for (const capability of DOWNLOADER_CAPABILITY_KEYS) {
    const value = capabilities[capability];
    const stateName = value === true
      ? "supported"
      : value === false ? "unsupported" : "unknown";
    const chip = document.createElement("span");
    chip.className = `manager-capability is-${stateName}`;
    const marker = document.createElement("span");
    marker.className = "manager-capability-marker";
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = stateName === "supported"
      ? "+"
      : stateName === "unsupported" ? "-" : "?";
    const label = document.createElement("span");
    label.setAttribute("data-l10n-attrs", "title,aria-label");
    setLocalized(
      label,
      `downloadit-manager-capability-${capability.replace(
        /[A-Z]/g,
        letter => `-${letter.toLowerCase()}`,
      )}-${stateName}`,
    );
    chip.append(marker, label);
    container.append(chip);
  }
  return container;
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
  const idmBridge = document.getElementById("idm-bridge");
  const idmBridgeLock = document.getElementById("idm-bridge-lock");
  sendCookies.checked = Boolean(state.draft && !state.draft.omitCookies);
  sendCookies.disabled = state.busy || !snapshot || Boolean(snapshot.omitCookiesLocked);
  cookieLock.hidden = !snapshot?.omitCookiesLocked;
  idmBridge.checked = Boolean(state.draft?.idmBridgeEnabled);
  idmBridge.disabled = state.busy ||
    !snapshot ||
    Boolean(snapshot.idmBridgeLocked);
  idmBridgeLock.hidden = !snapshot?.idmBridgeLocked;
}

function parseAutoCaptureInput(value) {
  const entries = String(value || "")
    .split(/[\s,;]+/)
    .map(entry => entry.trim())
    .filter(Boolean);
  if (entries.some(entry => normalizeAutoExtensions([entry]).length === 0)) {
    return null;
  }
  return normalizeAutoExtensions(entries);
}

function autoCaptureRulesAreDirty() {
  return Boolean(
    state.initial &&
    state.draft &&
    JSON.stringify(state.initial.autoCaptureRules) !==
      JSON.stringify(state.draft.autoCaptureRules)
  );
}

function addAutoCaptureRules(disposition) {
  if (!state.draft || state.snapshot?.autoCaptureRulesError) {
    return;
  }
  const input = document.getElementById(`auto-${disposition}-input`);
  const extensions = parseAutoCaptureInput(input.value);
  if (!extensions?.length) {
    setFeedback(localizedMessage("downloadit-error-auto-capture-extension"), "error");
    return;
  }
  const builtIn = extensions.find(isBuiltInAutoCaptureDeny);
  if (builtIn) {
    setFeedback(localizedMessage("downloadit-error-auto-capture-built-in", {
      extension: `.${builtIn}`,
    }), "error");
    return;
  }
  for (const extension of extensions) {
    state.draft.autoCaptureRules = updateAutoCaptureRule(
      state.draft.autoCaptureRules,
      extension,
      disposition,
      state.service.createAutoCaptureRuleId(),
    );
  }
  input.value = "";
  clearFeedback();
  render();
}

function clearAutoCaptureRules(disposition) {
  if (!state.draft || state.snapshot?.autoCaptureRulesError) {
    return;
  }
  state.draft.autoCaptureRules.rules = state.draft.autoCaptureRules.rules.filter(
    rule => rule.action !== disposition,
  );
  clearFeedback();
  render();
}

function removeAutoCaptureRule(event) {
  const button = event.target.closest("[data-remove-auto-rule]");
  if (!button || !state.draft || state.snapshot?.autoCaptureRulesError) {
    return;
  }
  state.draft.autoCaptureRules = updateAutoCaptureRule(
    state.draft.autoCaptureRules,
    button.dataset.removeAutoRule,
    "default",
  );
  clearFeedback();
  render();
}

function renderAutoCaptureRuleList(disposition) {
  const snapshot = state.snapshot;
  const ruleDocument = state.draft?.autoCaptureRules || snapshot?.autoCaptureRules;
  const extensions = ruleDocument
    ? listAutoCaptureExtensions(ruleDocument, disposition)
    : [];
  const builtInRules = disposition === "deny"
    ? snapshot?.builtInAutoCaptureDeny || []
    : [];
  const list = document.getElementById(`auto-${disposition}-list`);
  const clearButton = document.getElementById(`clear-auto-${disposition}`);
  const input = document.getElementById(`auto-${disposition}-input`);
  list.replaceChildren();
  if (!extensions.length && !builtInRules.length) {
    const empty = document.createElement("li");
    empty.className = "empty-row";
    const mark = document.createElement("span");
    mark.className = "empty-mark";
    mark.textContent = "--";
    const message = document.createElement("span");
    empty.append(mark, message);
    list.append(empty);
    setLocalized(message, disposition === "allow"
      ? "downloadit-no-auto-allow"
      : "downloadit-no-auto-deny");
  } else {
    const rules = [
      ...builtInRules.map(rule => ({ ...rule, builtIn: true })),
      ...extensions.map(extension => ({ extension, builtIn: false })),
    ];
    for (const rule of rules) {
      const row = document.createElement("li");
      row.className = "auto-extension-row";
      if (rule.builtIn) {
        row.classList.add("is-built-in");
      }
      const name = document.createElement("code");
      name.className = "auto-extension-name";
      name.textContent = `.${rule.extension}`;
      const details = document.createElement("span");
      details.className = "auto-extension-details";
      details.append(name);
      if (rule.builtIn) {
        const badge = document.createElement("span");
        badge.className = "rule-badge";
        setLocalized(badge, "downloadit-auto-rule-built-in");
        const reason = document.createElement("span");
        reason.className = "auto-rule-reason";
        setLocalized(reason, "downloadit-auto-rule-xpi-reason");
        details.append(badge, reason);
        row.append(details);
      } else {
        const remove = document.createElement("button");
        remove.className = "icon-button";
        remove.type = "button";
        remove.dataset.removeAutoRule = rule.extension;
        remove.textContent = "\u00d7";
        setLocalized(
          remove,
          disposition === "allow"
            ? "downloadit-remove-auto-allow"
            : "downloadit-remove-auto-deny",
          { extension: `.${rule.extension}` },
        );
        row.append(details, remove);
      }
      list.append(row);
    }
  }
  const blocked = Boolean(snapshot?.autoCaptureRulesError);
  clearButton.parentElement.hidden = !extensions.length;
  clearButton.disabled = blocked || state.busy;
  input.disabled = blocked || state.busy;
  document.getElementById(`add-auto-${disposition}`).disabled =
    blocked || state.busy;
  for (const button of list.querySelectorAll("[data-remove-auto-rule]")) {
    button.disabled = blocked || state.busy;
  }
}

function renderAutoCaptureRules() {
  const configError = document.getElementById("auto-capture-config-error");
  const configErrorMessage = document.getElementById(
    "auto-capture-config-error-message",
  );
  const error = state.snapshot?.autoCaptureRulesError;
  configError.hidden = !error;
  if (error) {
    setLocalized(configErrorMessage, "downloadit-auto-capture-config-load-error", {
      error: error.message || error.code,
      path: state.snapshot.autoCaptureRulesPath,
    });
  }
  document.getElementById("retry-auto-capture-rules").disabled = state.busy;
  document.getElementById("reset-auto-capture-rules").disabled = state.busy;
  renderAutoCaptureRuleList("allow");
  renderAutoCaptureRuleList("deny");
}

function linkGroupDisplayName(group) {
  return group.builtIn ? group.key : group.name;
}

function setLinkGroupName(element, group) {
  if (group.builtIn) {
    setLocalized(element, BUILT_IN_GROUP_MESSAGE_IDS[group.key]);
  } else {
    element.textContent = group.name;
  }
}

function renderLinkGroupRow(group, locked) {
  const row = document.createElement("li");
  row.className = `link-group-row${group.enabled ? "" : " is-disabled"}`;

  const toggle = document.createElement("label");
  toggle.className = "mini-toggle";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = group.enabled;
  checkbox.disabled = locked || state.busy;
  checkbox.dataset.toggleLinkGroup = group.key;
  setLocalized(checkbox, "downloadit-link-group-toggle", {
    group: linkGroupDisplayName(group),
  });
  const track = document.createElement("span");
  track.className = "toggle-track";
  track.setAttribute("aria-hidden", "true");
  const thumb = document.createElement("span");
  thumb.className = "toggle-thumb";
  track.append(thumb);
  toggle.append(checkbox, track);

  const details = document.createElement("div");
  details.className = "link-group-details";
  const heading = document.createElement("div");
  heading.className = "link-group-row-heading";
  const name = document.createElement("strong");
  setLinkGroupName(name, group);
  const key = document.createElement("code");
  key.className = "link-group-key";
  key.textContent = group.key;
  heading.append(name, key);
  const extensions = document.createElement("div");
  extensions.className = "link-group-extensions";
  if (group.extensions.length) {
    for (const extension of group.extensions) {
      const chip = document.createElement("code");
      chip.textContent = `.${extension}`;
      extensions.append(chip);
    }
  } else {
    const empty = document.createElement("span");
    setLocalized(empty, "downloadit-link-group-no-extensions");
    extensions.append(empty);
  }
  details.append(heading, extensions);

  const actions = document.createElement("div");
  actions.className = "link-group-actions";
  const edit = document.createElement("button");
  edit.className = "icon-button";
  edit.type = "button";
  edit.dataset.editLinkGroup = group.key;
  edit.textContent = "\u270e";
  edit.disabled = locked || state.busy;
  setLocalized(edit, "downloadit-edit-link-group", {
    group: linkGroupDisplayName(group),
  });
  actions.append(edit);
  if (!group.builtIn) {
    const remove = document.createElement("button");
    remove.className = "icon-button link-group-remove";
    remove.type = "button";
    remove.dataset.removeLinkGroup = group.key;
    remove.textContent = "\u00d7";
    remove.disabled = locked || state.busy;
    setLocalized(remove, "downloadit-remove-link-group", { group: group.name });
    actions.append(remove);
  }

  row.append(toggle, details, actions);
  return row;
}

function renderLinkGroups() {
  const settings = state.draft?.linkGroups || state.snapshot?.linkGroups;
  const builtInList = document.getElementById("built-in-link-group-list");
  const customList = document.getElementById("custom-link-group-list");
  const lock = document.getElementById("link-group-lock");
  const addButton = document.getElementById("add-custom-link-group");
  builtInList.replaceChildren();
  customList.replaceChildren();
  const groups = settings?.groups || [];
  const builtIn = groups.filter(group => group.builtIn);
  const custom = groups.filter(group => !group.builtIn);
  const locked = Boolean(state.snapshot?.linkGroupsLocked);

  for (const group of builtIn) {
    builtInList.append(renderLinkGroupRow(group, locked));
  }
  if (custom.length) {
    for (const group of custom) {
      customList.append(renderLinkGroupRow(group, locked));
    }
  } else {
    const empty = document.createElement("li");
    empty.className = "empty-row link-group-empty";
    const mark = document.createElement("span");
    mark.className = "empty-mark";
    mark.textContent = "--";
    const message = document.createElement("span");
    setLocalized(message, "downloadit-no-custom-link-groups");
    empty.append(mark, message);
    customList.append(empty);
  }

  setLocalized(document.getElementById("link-group-count"), "downloadit-link-group-count", {
    count: groups.filter(group => group.enabled).length,
  });
  setLocalized(
    document.getElementById("custom-link-group-count"),
    "downloadit-custom-link-group-count",
    { count: custom.length },
  );
  lock.hidden = !locked;
  addButton.disabled = locked || state.busy || !state.service;
}

function validateMirrorDraft() {
  state.mirrorValidation = null;
  if (!state.service || !state.draft?.mirrorSettings) {
    return true;
  }
  try {
    state.service.validateMirrorSettings(state.draft.mirrorSettings);
    return true;
  } catch (error) {
    state.mirrorValidation = localizedError(error);
    return false;
  }
}

function renderMirrorValidation() {
  const note = document.getElementById("mirror-validation");
  const message = document.getElementById("mirror-validation-message");
  note.hidden = !state.mirrorValidation;
  if (state.mirrorValidation) {
    setLocalizedMessage(message, state.mirrorValidation);
  }
  for (const input of document.querySelectorAll("[data-mirror-endpoint]")) {
    const invalidAdapter = state.mirrorValidation?.args?.adapter || "";
    input.setAttribute("aria-invalid", String(Boolean(
      state.mirrorValidation &&
      (!invalidAdapter || invalidAdapter === input.dataset.mirrorEndpoint)
    )));
  }
}

function renderMirrors() {
  const list = document.getElementById("mirror-adapter-list");
  const locked = Boolean(state.snapshot?.mirrorSettingsLocked);
  const settings = state.draft?.mirrorSettings;
  list.replaceChildren();

  for (const adapter of state.snapshot?.mirrorAdapters || []) {
    const adapterSettings = settings?.adapters?.[adapter.id];
    if (!adapterSettings) {
      continue;
    }
    const row = document.createElement("div");
    row.className = `mirror-adapter-row${adapterSettings.enabled ? "" : " is-disabled"}`;

    const heading = document.createElement("div");
    heading.className = "mirror-adapter-heading";
    const toggle = document.createElement("label");
    toggle.className = "mini-toggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = adapterSettings.enabled;
    checkbox.disabled = locked || state.busy;
    checkbox.dataset.mirrorEnabled = adapter.id;
    const titleId = `mirror-adapter-${adapter.id}-title`;
    checkbox.setAttribute("aria-labelledby", titleId);
    const track = document.createElement("span");
    track.className = "toggle-track";
    track.setAttribute("aria-hidden", "true");
    const thumb = document.createElement("span");
    thumb.className = "toggle-thumb";
    track.append(thumb);
    toggle.append(checkbox, track);

    const copy = document.createElement("div");
    copy.className = "mirror-adapter-copy";
    const title = document.createElement("strong");
    title.id = titleId;
    setLocalized(title, adapter.nameL10nId);
    const description = document.createElement("span");
    description.id = `mirror-adapter-${adapter.id}-description`;
    setLocalized(description, adapter.descriptionL10nId);
    copy.append(title, description);

    const status = document.createElement("span");
    status.className = `mirror-status${adapterSettings.enabled ? " is-enabled" : ""}`;
    setLocalized(
      status,
      adapterSettings.enabled
        ? "downloadit-mirror-enabled"
        : "downloadit-mirror-disabled",
    );
    heading.append(toggle, copy, status);

    const field = document.createElement("div");
    field.className = "mirror-endpoint-field";
    const label = document.createElement("label");
    label.htmlFor = `mirror-endpoint-${adapter.id}`;
    setLocalized(label, "downloadit-mirror-endpoint-label");
    const input = document.createElement("input");
    input.id = `mirror-endpoint-${adapter.id}`;
    input.type = "url";
    input.value = adapterSettings.endpoint;
    input.spellcheck = false;
    input.autocomplete = "off";
    input.disabled = locked || state.busy;
    input.dataset.mirrorEndpoint = adapter.id;
    input.setAttribute(
      "aria-describedby",
      `mirror-adapter-${adapter.id}-description mirror-endpoint-help`,
    );
    field.append(label, input);
    row.append(heading, field);
    list.append(row);
  }

  document.getElementById("mirror-settings-lock").hidden = !locked;
  renderMirrorValidation();
}

function renderAbout() {
  const snapshot = state.snapshot;
  document.getElementById("binary-path").textContent = snapshot?.binaryPath || "--";
}

function errorText(error) {
  return String(error?.message || error || "");
}

function localizedError(error) {
  if (
    error?.name === "LinkGroupValidationError" &&
    LINK_GROUP_ERROR_MESSAGES[error.code]
  ) {
    return localizedMessage(LINK_GROUP_ERROR_MESSAGES[error.code], error.args || null);
  }
  if (CUSTOM_ERROR_MESSAGES[error?.code]) {
    return localizedMessage(CUSTOM_ERROR_MESSAGES[error.code], error.args || null);
  }
  if (MIRROR_ERROR_MESSAGES[error?.code]) {
    return localizedMessage(MIRROR_ERROR_MESSAGES[error.code], error.args || null);
  }
  const message = errorText(error);
  if (/default download manager preference is locked/i.test(message)) {
    return localizedMessage("downloadit-error-locked-default");
  }
  if (/cookie preference is locked/i.test(message)) {
    return localizedMessage("downloadit-error-locked-cookies");
  }
  if (/task start preference is locked/i.test(message)) {
    return localizedMessage("downloadit-error-locked-task-start");
  }
  if (/JDownloader .* preference is locked/i.test(message)) {
    return localizedMessage("downloadit-error-locked-jdownloader");
  }
  if (/link group preference is locked/i.test(message)) {
    return localizedMessage("downloadit-error-locked-link-groups");
  }
  if (/mirror preference is locked/i.test(message)) {
    return localizedMessage("downloadit-error-locked-mirrors");
  }
  if (/IDM bridge preference is locked/i.test(message)) {
    return localizedMessage("downloadit-error-locked-idm-bridge");
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
    const refresh = state.service.refreshManagers({ persistDefault: false });
    watchBuiltInRefresh();
    await refresh;
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

async function reloadAutoCaptureRules() {
  if (!state.service || state.busy) {
    return;
  }
  if (autoCaptureRulesAreDirty()) {
    const message = await document.l10n.formatValue(
      "downloadit-confirm-reload-auto-capture",
    );
    if (!window.confirm(message)) {
      return;
    }
  }
  state.busy = true;
  render();
  try {
    state.snapshot = await state.service.reloadAutoCaptureRules();
    state.initial.autoCaptureRules = clone(state.snapshot.autoCaptureRules);
    state.draft.autoCaptureRules = clone(state.snapshot.autoCaptureRules);
    if (!state.snapshot.autoCaptureRulesError) {
      setFeedback(localizedMessage("downloadit-auto-capture-reloaded"), "success");
    }
  } catch (error) {
    setFeedback(localizedError(error), "error");
  } finally {
    state.busy = false;
  }
  render();
}

async function resetAutoCaptureRules() {
  const message = await document.l10n.formatValue(
    "downloadit-confirm-reset-auto-capture",
  );
  if (!window.confirm(message)) {
    return;
  }
  state.busy = true;
  render();
  try {
    state.snapshot = await state.service.resetAutoCaptureRules();
    state.initial.autoCaptureRules = clone(state.snapshot.autoCaptureRules);
    state.draft.autoCaptureRules = clone(state.snapshot.autoCaptureRules);
    setFeedback(localizedMessage("downloadit-auto-capture-reset"), "success");
  } catch (error) {
    setFeedback(localizedError(error), "error");
  } finally {
    state.busy = false;
  }
  render();
}

function openLinkGroupEditor(key = "") {
  if (!state.draft?.linkGroups || state.snapshot?.linkGroupsLocked) {
    return;
  }
  const existing = state.draft.linkGroups.groups.find(group => group.key === key);
  const group = existing ? clone(existing) : {
    key: "",
    name: "",
    builtIn: false,
    enabled: true,
    extensions: [],
  };
  state.linkGroupEditor = { existingKey: existing?.key || "", group };
  state.editorReturnFocus = document.activeElement;
  const nameField = document.getElementById("link-group-name-field");
  const nameInput = document.getElementById("link-group-name");
  const keyInput = document.getElementById("link-group-key");
  nameField.hidden = group.builtIn;
  nameInput.value = group.name || "";
  keyInput.value = group.key;
  keyInput.readOnly = group.builtIn;
  document.getElementById("link-group-enabled").checked = group.enabled;
  document.getElementById("link-group-extensions").value =
    group.extensions.join("\n");
  document.getElementById("link-group-editor-error").hidden = true;
  setLocalized(
    document.getElementById("link-group-editor-title"),
    group.builtIn
      ? "downloadit-link-group-editor-built-in-title"
      : existing
        ? "downloadit-link-group-editor-edit-title"
        : "downloadit-link-group-editor-add-title",
  );
  document.getElementById("link-group-editor").hidden = false;
  document.getElementById("app").inert = true;
  (group.builtIn ? document.getElementById("link-group-extensions") : nameInput).focus();
}

function closeLinkGroupEditor() {
  state.linkGroupEditor = null;
  document.getElementById("link-group-editor").hidden = true;
  document.getElementById("app").inert = false;
  if (state.editorReturnFocus?.isConnected) {
    state.editorReturnFocus.focus();
  }
  state.editorReturnFocus = null;
}

function parseLinkGroupExtensions(value) {
  return String(value || "")
    .split(/[\s,;]+/)
    .map(extension => extension.trim())
    .filter(Boolean);
}

function saveLinkGroupEditor() {
  const current = state.linkGroupEditor;
  if (!current || !state.draft?.linkGroups) {
    return;
  }
  try {
    const group = {
      key: current.group.builtIn
        ? current.group.key
        : document.getElementById("link-group-key").value.trim(),
      ...(current.group.builtIn
        ? { builtIn: true }
        : {
            builtIn: false,
            name: document.getElementById("link-group-name").value.trim(),
          }),
      enabled: document.getElementById("link-group-enabled").checked,
      extensions: parseLinkGroupExtensions(
        document.getElementById("link-group-extensions").value,
      ),
    };
    const settings = clone(state.draft.linkGroups);
    const index = settings.groups.findIndex(entry => entry.key === current.existingKey);
    if (index >= 0) {
      settings.groups[index] = group;
    } else {
      settings.groups.push(group);
    }
    state.draft.linkGroups = validateLinkGroupSettings(settings);
  } catch (error) {
    const message = localizedError(error);
    document.getElementById("link-group-editor-error").hidden = false;
    setLocalizedMessage(document.getElementById("link-group-editor-error-message"), message);
    return;
  }
  closeLinkGroupEditor();
  clearFeedback();
  render();
}

function toggleLinkGroup(key, enabled) {
  if (!state.draft?.linkGroups || state.snapshot?.linkGroupsLocked) {
    return;
  }
  const group = state.draft.linkGroups.groups.find(entry => entry.key === key);
  if (!group) {
    return;
  }
  group.enabled = Boolean(enabled);
  clearFeedback();
  render();
}

async function removeCustomLinkGroup(key) {
  if (!state.draft?.linkGroups || state.snapshot?.linkGroupsLocked) {
    return;
  }
  const group = state.draft.linkGroups.groups.find(
    entry => entry.key === key && !entry.builtIn,
  );
  if (!group) {
    return;
  }
  const message = await document.l10n.formatValue(
    "downloadit-confirm-remove-link-group",
    { group: group.name },
  );
  if (!window.confirm(message)) {
    return;
  }
  state.draft.linkGroups.groups = state.draft.linkGroups.groups.filter(
    entry => entry.key !== key,
  );
  clearFeedback();
  render();
}

function createDefaultCustomDownloader() {
  return {
    id: state.service.createCustomDownloaderId(),
    name: "",
    enabled: true,
    type: "command",
    startHidden: true,
    command: { executablePath: "", argumentsTemplate: "[URL]" },
  };
}

function getBuiltInProtocolSnapshot(id) {
  return state.snapshot?.builtInProtocols?.find(protocol => protocol.id === id) || null;
}

function openDownloadToolEditor(kind = "builtin", id = "") {
  const existing = kind === "custom"
    ? state.draft.customDownloaders.downloaders.find(
        downloader => downloader.id === id,
      )
    : null;
  const downloader = existing ? clone(existing) : createDefaultCustomDownloader();
  const builtInProtocol = kind === "builtin" && BUILT_IN_PROTOCOLS.some(
    protocol => protocol.id === id,
  ) ? id : BUILT_IN_PROTOCOLS[0]?.id || "";
  const builtInEnabled = Boolean(
    state.draft?.builtInProtocols?.[builtInProtocol]?.enabled,
  );
  state.editor = {
    kind,
    editingKind: id || (kind === "builtin" && builtInEnabled) ? kind : "",
    existingId: existing?.id || "",
    builtInProtocol,
    downloader,
  };
  state.editorReturnFocus = document.activeElement;

  const jDownloader = state.draft.builtInProtocols[JDOWNLOADER_PROVIDER];
  document.getElementById("jdownloader-endpoint").value = jDownloader.endpoint;
  document.getElementById("jdownloader-auto-launch").checked =
    jDownloader.autoLaunch;
  document.getElementById("jdownloader-launch-path").value =
    jDownloader.launchPath;
  document.getElementById("jdownloader-test-state").textContent = "";
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
  document.getElementById("tool-editor-error").hidden = true;
  setEditorType(downloader.type);
  document.getElementById("download-tool-editor").hidden = false;
  document.getElementById("app").inert = true;
  renderDownloadToolEditor();
  const initialFocus = kind === "builtin"
    ? document.getElementById("test-jdownloader")
    : document.getElementById("custom-name");
  initialFocus.focus();
}

function closeDownloadToolEditor() {
  state.editor = null;
  document.getElementById("download-tool-editor").hidden = true;
  document.getElementById("app").inert = false;
  if (state.editorReturnFocus?.isConnected) {
    state.editorReturnFocus.focus();
  }
  state.editorReturnFocus = null;
}

function setEditorKind(kind) {
  if (!state.editor || !["builtin", "custom"].includes(kind)) {
    return;
  }
  if (
    (state.editor.editingKind && state.editor.editingKind !== kind) ||
    (kind === "custom" && state.snapshot?.customDownloadersError)
  ) {
    return;
  }
  state.editor.kind = kind;
  document.getElementById("tool-editor-error").hidden = true;
  renderDownloadToolEditor();
  const focusTarget = kind === "builtin"
    ? document.getElementById("built-in-protocol")
    : document.getElementById("custom-name");
  focusTarget.focus();
}

function renderDownloadToolEditor() {
  if (!state.editor) {
    return;
  }
  const customBlocked = Boolean(state.snapshot?.customDownloadersError);
  for (const button of document.querySelectorAll("[data-tool-kind]")) {
    const kind = button.dataset.toolKind;
    const active = kind === state.editor.kind;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.disabled = Boolean(
      (state.editor.editingKind && state.editor.editingKind !== kind) ||
      (kind === "custom" && customBlocked),
    );
  }
  document.getElementById("tool-editor-builtin").hidden =
    state.editor.kind !== "builtin";
  document.getElementById("tool-editor-custom").hidden =
    state.editor.kind !== "custom";

  const protocolSelect = document.getElementById("built-in-protocol");
  protocolSelect.value = state.editor.builtInProtocol;
  protocolSelect.disabled = BUILT_IN_PROTOCOLS.length < 2 ||
    state.editor.editingKind === "builtin";
  for (const fields of document.querySelectorAll("[data-built-in-protocol-fields]")) {
    fields.hidden = fields.dataset.builtInProtocolFields !==
      state.editor.builtInProtocol;
  }

  const editingCustom = state.editor.editingKind === "custom";
  setLocalized(
    document.getElementById("tool-editor-title"),
    state.editor.editingKind === "builtin"
      ? "downloadit-tool-editor-configure-title"
      : editingCustom
        ? "downloadit-tool-editor-edit-title"
        : "downloadit-tool-editor-add-title",
  );
  setLocalized(
    document.getElementById("tool-editor-save"),
    state.editor.kind === "builtin"
      ? state.editor.editingKind === "builtin"
        ? "downloadit-tool-editor-save-built-in"
        : "downloadit-tool-editor-add"
      : editingCustom
        ? "downloadit-tool-editor-save"
        : "downloadit-tool-editor-add",
  );
  document.getElementById("tool-editor-save").disabled =
    (state.editor.kind === "custom" && customBlocked) ||
    (
      state.editor.kind === "builtin" &&
      !state.draft.builtInProtocols[state.editor.builtInProtocol]?.enabled &&
      Boolean(getBuiltInProtocolSnapshot(state.editor.builtInProtocol)?.locks.enabled)
    );
  renderEditorType();
  renderJDownloaderEditorState();
}

function renderJDownloaderEditorState() {
  if (!state.editor) {
    return;
  }
  const protocol = getBuiltInProtocolSnapshot(JDOWNLOADER_PROVIDER);
  const locks = protocol?.locks || {};
  const endpoint = document.getElementById("jdownloader-endpoint");
  const autoLaunch = document.getElementById("jdownloader-auto-launch");
  const launchPath = document.getElementById("jdownloader-launch-path");
  const browse = document.getElementById("browse-jdownloader-path");
  const clear = document.getElementById("clear-jdownloader-path");
  const test = document.getElementById("test-jdownloader");
  const lock = document.getElementById("jdownloader-lock");
  const status = document.getElementById("jdownloader-status");
  const statusDot = document.getElementById("jdownloader-status-dot");
  const detectedPath = document.getElementById("jdownloader-detected-path");

  endpoint.disabled = Boolean(locks.endpoint);
  autoLaunch.disabled = Boolean(locks.autoLaunch);
  launchPath.disabled = Boolean(locks.launchPath);
  browse.disabled = launchPath.disabled;
  clear.disabled = launchPath.disabled || !launchPath.value;
  test.disabled = !state.service || !endpoint.value;
  lock.hidden = !Object.values(locks).some(Boolean);

  let available = false;
  try {
    available = state.service.createJDownloaderDescriptor({
      ...state.draft.builtInProtocols[JDOWNLOADER_PROVIDER],
      enabled: true,
      endpoint: endpoint.value,
      launchPath: launchPath.value,
      autoLaunch: autoLaunch.checked,
    }).available;
  } catch {}
  statusDot.className = `manager-dot ${available ? "is-ready" : "is-error"}`;
  setLocalized(
    status,
    available
      ? "downloadit-jdownloader-status-ready"
      : "downloadit-jdownloader-status-unavailable",
  );

  let sameEndpoint = false;
  try {
    sameEndpoint = state.service.normalizeJDownloaderSettings({
      endpoint: endpoint.value,
      launchPath: "",
      autoLaunch: false,
    }, { requireExistingPath: false }).endpoint === protocol?.settings.endpoint;
  } catch {}
  if (sameEndpoint && protocol?.settings.detectedPath) {
    setLocalized(detectedPath, "downloadit-jdownloader-detected-path", {
      path: protocol.settings.detectedPath,
    });
  } else {
    setLocalized(detectedPath, "downloadit-jdownloader-not-detected");
  }
}

function trapEditorFocus(event, editorId) {
  const dialog = document.querySelector(`#${editorId} .editor-dialog`);
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

function saveDownloadToolEditor() {
  try {
    if (state.editor.kind === "builtin") {
      const protocol = state.editor.builtInProtocol;
      if (protocol !== JDOWNLOADER_PROVIDER) {
        throw new Error(`Unsupported built-in protocol: ${protocol}`);
      }
      const settings = state.service.normalizeJDownloaderSettings({
        endpoint: document.getElementById("jdownloader-endpoint").value,
        launchPath: document.getElementById("jdownloader-launch-path").value,
        autoLaunch: document.getElementById("jdownloader-auto-launch").checked,
      });
      state.draft.builtInProtocols[protocol] = {
        ...state.draft.builtInProtocols[protocol],
        ...settings,
        enabled: true,
      };
      closeDownloadToolEditor();
      clearFeedback();
      renderedManagerKeys = null;
      render();
      return;
    }
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
    const container = document.getElementById("tool-editor-error");
    container.hidden = false;
    setLocalizedMessage(document.getElementById("tool-editor-error-message"), message);
    return;
  }
  closeDownloadToolEditor();
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

async function removeBuiltInDownloader(id) {
  const protocol = BUILT_IN_PROTOCOLS.find(entry => entry.id === id);
  const settings = state.draft?.builtInProtocols?.[id];
  if (!protocol || !settings?.enabled) {
    return;
  }
  const message = await document.l10n.formatValue(
    "downloadit-confirm-remove-built-in",
    { name: protocol.name },
  );
  if (!window.confirm(message)) {
    return;
  }
  const removedKey = state.service.createJDownloaderDescriptor(settings).key;
  settings.enabled = false;
  if (state.draft.defaultManager === removedKey) {
    const fallback = draftDownloaders().find(downloader => downloader.available);
    state.draft.defaultManager = fallback?.key || "";
    state.defaultManagerTouched = true;
  }
  renderedManagerKeys = null;
  clearFeedback();
  render();
}

function watchBuiltInRefresh() {
  const refresh = state.service?.builtInRefreshPromise;
  if (!refresh || refresh === observedBuiltInRefresh) {
    return;
  }
  observedBuiltInRefresh = refresh;
  const finish = () => {
    if (observedBuiltInRefresh === refresh) {
      observedBuiltInRefresh = null;
    }
    watchBuiltInRefresh();
  };
  refresh.then(
    () => {
      try {
        if (state.service && !window.closed) {
          state.snapshot = state.service.readSettings();
          renderedManagerKeys = null;
          render();
        }
      } catch (error) {
        console.error("DownloadIt: built-in protocol state refresh failed", error);
      }
    },
    error => {
      console.error("DownloadIt: built-in protocol refresh failed", error);
    },
  ).then(finish, finish);
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

async function browseJDownloaderPath() {
  const path = await browseLocalFile("jdownloader-launch-path", {
    titleId: "downloadit-browse-jdownloader-title",
    filterId: "downloadit-jdownloader-file-filter",
    filter: "*.exe;*.jar",
    absolute: true,
    includeAllFiles: false,
  });
  if (path == null || !state.editor) {
    return;
  }
  renderJDownloaderEditorState();
}

function clearJDownloaderPath() {
  const protocol = getBuiltInProtocolSnapshot(JDOWNLOADER_PROVIDER);
  if (!state.editor || protocol?.locks?.launchPath) {
    return;
  }
  document.getElementById("jdownloader-launch-path").value = "";
  renderJDownloaderEditorState();
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
  absolute = false,
  includeAllFiles = true,
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
  if (includeAllFiles) {
    picker.appendFilters(Ci.nsIFilePicker.filterAll);
  }
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
    const path = absolute
      ? picker.file.path
      : state.service.normalizeCustomFilePathForStorage(picker.file);
    document.getElementById(inputId).value = path;
    return path;
  }
  return null;
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

async function testJDownloader() {
  const button = document.getElementById("test-jdownloader");
  const output = document.getElementById("jdownloader-test-state");
  button.disabled = true;
  output.className = "";
  setLocalized(output, "downloadit-jdownloader-testing");
  try {
    const result = await state.service.testJDownloaderConfiguration({
      endpoint: document.getElementById("jdownloader-endpoint").value,
    });
    output.className = "is-success";
    setLocalized(output, "downloadit-jdownloader-test-success", {
      path: result.path,
    });
  } catch (error) {
    output.className = "is-error";
    setLocalized(output, "downloadit-jdownloader-test-failed", {
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
    if (state.snapshot.autoCaptureRulesError) {
      payload.autoCaptureRules = null;
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
    const builtInSelect = document.getElementById("built-in-protocol");
    for (const protocol of BUILT_IN_PROTOCOLS) {
      const option = document.createElement("option");
      option.value = protocol.id;
      option.textContent = protocol.name;
      builtInSelect.append(option);
    }
    bindEvents();
    state.service = getActiveService();
    if (state.service) {
      state.snapshot = state.service.readSettings();
      state.initial = createSettingsState(state.snapshot);
      state.draft = createSettingsState(state.snapshot);
    }
    render();
    watchBuiltInRefresh();
  } catch (error) {
    console.error("DownloadIt: settings initialization failed", error);
  }
}

window.addEventListener("DOMContentLoaded", init, { once: true });
})();

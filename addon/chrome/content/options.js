(() => {
"use strict";

const { getActiveService } = ChromeUtils.importESModule(
  "chrome://downloadit/content/DownloadItService.sys.mjs",
);
const { initializeDownloadItLocalization } = ChromeUtils.importESModule(
  "chrome://downloadit/content/DownloadItLocalization.sys.mjs",
);
const { createXULElement } = ChromeUtils.importESModule(
  "chrome://downloadit/content/DownloadItXUL.sys.mjs",
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
};

let renderedManagerNames = null;

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

function bindEvents() {
  for (const button of document.querySelectorAll(".nav-item")) {
    button.addEventListener("click", () => {
      state.section = button.dataset.section;
      render();
    });
  }

  document.getElementById("default-manager").addEventListener("command", event => {
    state.draft.defaultManager = event.target.value || event.currentTarget.value;
    clearFeedback();
    render();
  });

  document.getElementById("send-cookies").addEventListener("change", event => {
    state.draft.omitCookies = !event.target.checked;
    clearFeedback();
    render();
  });

  document.getElementById("refresh-managers").addEventListener("click", refreshManagers);
  document.getElementById("apply").addEventListener("click", applySettings);
  document.getElementById("cancel").addEventListener("click", () => window.close());
}

function isDirty() {
  return Boolean(
    state.initial &&
    state.draft &&
    (
      state.initial.defaultManager !== state.draft.defaultManager ||
      state.initial.omitCookies !== state.draft.omitCookies
    )
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
    service.platformSupported
      ? "downloadit-windows"
      : "downloadit-unsupported-platform",
  );
}

function renderManagers() {
  const snapshot = state.snapshot;
  const managers = snapshot?.managers || [];
  const select = document.getElementById("default-manager");
  const popup = document.getElementById("default-manager-popup");
  const list = document.getElementById("manager-list");
  const count = document.getElementById("manager-count");
  const countLabel = document.getElementById("manager-count-label");
  const managerState = document.getElementById("manager-state");
  const refreshButton = document.getElementById("refresh-managers");
  const defaultLock = document.getElementById("default-manager-lock");

  setLocalized(count, "downloadit-manager-count", { count: managers.length });
  setLocalized(countLabel, "downloadit-manager-count-label", { count: managers.length });

  const managersChanged = renderedManagerNames === null ||
    renderedManagerNames.length !== managers.length ||
    renderedManagerNames.some((manager, index) => manager !== managers[index]);
  if (managersChanged) {
    popup.replaceChildren();
    if (!managers.length) {
      const item = createXULElement(document, "menuitem");
      popup.append(item);
      setLocalized(item, "downloadit-no-manager-option");
      item.setAttribute("value", "");
    } else {
      for (const manager of managers) {
        const item = createXULElement(document, "menuitem");
        item.setAttribute("label", manager);
        item.setAttribute("value", manager);
        popup.append(item);
      }
    }
    renderedManagerNames = [...managers];
  }
  if (managers.length) {
    for (const manager of managers) {
      if (manager === (state.draft?.defaultManager || snapshot.defaultManager)) {
        select.value = manager;
        break;
      }
    }
    if (!select.value) {
      select.value = managers[0];
    }
  } else {
    // Keep the empty XUL item selected while the service is unavailable.
    select.value = "";
  }

  select.disabled = !managers.length || state.busy || Boolean(snapshot?.defaultManagerLocked);
  refreshButton.disabled = state.busy || !snapshot?.serviceReady;
  refreshButton.querySelector(".button-glyph").textContent = state.scanState === "loading" ? "..." : "↻";
  defaultLock.hidden = !snapshot?.defaultManagerLocked;

  managerState.className = "status-strip-state";
  if (state.scanState === "loading") {
    setLocalized(managerState, "downloadit-detection-loading");
  } else if (state.scanState === "error") {
    setLocalized(managerState, "downloadit-detection-error", {
      error: state.scanMessage,
    });
    managerState.classList.add("is-error");
  } else if (state.scanState === "success") {
    setLocalized(managerState, "downloadit-detection-success", {
      count: managers.length,
    });
    managerState.classList.add("is-success");
  } else if (!managers.length) {
    setLocalized(managerState, "downloadit-no-managers");
  } else {
    setLocalized(managerState, "downloadit-detection-idle");
  }

  list.replaceChildren();
  if (!managers.length) {
    const empty = document.createElement("li");
    empty.className = "empty-row";
    const mark = document.createElement("span");
    mark.className = "empty-mark";
    mark.textContent = "--";
    const message = document.createElement("span");
    empty.append(mark, message);
    list.append(empty);
    setLocalized(message, "downloadit-no-managers");
    return;
  }

  for (const manager of managers) {
    const row = document.createElement("li");
    row.className = "manager-row";

    const dot = document.createElement("span");
    dot.className = "manager-dot is-ready";
    dot.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.className = "manager-name";
    name.textContent = manager;
    row.append(dot, name);

    if (manager === state.draft?.defaultManager) {
      const badge = document.createElement("span");
      badge.className = "manager-badge";
      row.append(badge);
      setLocalized(badge, "downloadit-manager-default");
    }
    list.append(row);
  }
}

function renderPrivacy() {
  const snapshot = state.snapshot;
  const sendCookies = document.getElementById("send-cookies");
  const cookieLock = document.getElementById("cookie-lock");
  sendCookies.checked = Boolean(state.draft && !state.draft.omitCookies);
  sendCookies.disabled = state.busy || !snapshot || Boolean(snapshot.omitCookiesLocked);
  cookieLock.hidden = !snapshot?.omitCookiesLocked;
}

function renderAbout() {
  const snapshot = state.snapshot;
  document.getElementById("binary-path").textContent = snapshot?.binaryPath || "--";
}

function errorText(error) {
  return String(error?.message || error || "");
}

function localizedError(error) {
  const message = errorText(error);
  if (/default download manager preference is locked/i.test(message)) {
    return localizedMessage("downloadit-error-locked-default");
  }
  if (/cookie preference is locked/i.test(message)) {
    return localizedMessage("downloadit-error-locked-cookies");
  }
  if (/unsupported download manager/i.test(message)) {
    return localizedMessage("downloadit-error-unsupported-manager");
  }
  if (!message) {
    return localizedMessage("downloadit-error-service");
  }
  return localizedMessage("downloadit-error-unexpected", { error: message });
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
    const nextSnapshot = state.service.readSettings();
    state.snapshot = nextSnapshot;
    if (!nextSnapshot.managers.includes(state.draft.defaultManager)) {
      state.draft.defaultManager = nextSnapshot.defaultManager;
    }
    state.scanState = "success";
  } catch (error) {
    state.scanState = "error";
    state.scanMessage = errorText(error);
  }
  render();
}

async function applySettings() {
  if (state.busy || !state.service || !state.draft) {
    return;
  }
  if (
    state.draft.defaultManager &&
    !state.snapshot.managers.includes(state.draft.defaultManager)
  ) {
    setFeedback(localizedMessage("downloadit-error-unsupported-manager"), "error");
    render();
    return;
  }

  state.busy = true;
  clearFeedback();
  render();
  try {
    const nextSnapshot = state.service.applySettings(state.draft);
    state.snapshot = nextSnapshot;
    state.initial = {
      defaultManager: nextSnapshot.defaultManager,
      omitCookies: nextSnapshot.omitCookies,
    };
    state.draft = { ...state.initial };
    state.scanState = "idle";
    setFeedback(localizedMessage("downloadit-applied"), "success");
  } catch (error) {
    setFeedback(localizedError(error), "error");
  } finally {
    state.busy = false;
  }
  render();
}

async function init() {
  try {
    await localizationReady;
    bindEvents();
    state.service = getActiveService();
    if (state.service) {
      state.snapshot = state.service.readSettings();
      state.initial = {
        defaultManager: state.snapshot.defaultManager,
        omitCookies: state.snapshot.omitCookies,
      };
      state.draft = { ...state.initial };
    }
    render();
  } catch (error) {
    console.error("DownloadIt: settings localization failed", error);
  }
}

window.addEventListener("DOMContentLoaded", init, { once: true });
})();

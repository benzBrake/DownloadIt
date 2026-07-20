(() => {
"use strict";

const { getActiveService } = ChromeUtils.importESModule(
  "chrome://downloadit/content/DownloadItService.sys.mjs",
);

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

function createXULElement(name) {
  return document.createElementNS(XUL_NS, name);
}

const TEXT = {
  "en-US": {
    brandSubtitle: "download bridge",
    navLabel: "Settings sections",
    navManagers: "Download manager",
    navPrivacy: "Request & privacy",
    navAbout: "About / diagnostics",
    managerKicker: "01 / runtime",
    managerTitle: "Download manager",
    managerDescription: "Choose the default tool for DownloadIt downloads and inspect the managers available on this system.",
    privacyKicker: "02 / request policy",
    privacyTitle: "Request & privacy",
    privacyDescription: "Choose which browser request details are forwarded to external download tools.",
    aboutKicker: "03 / service details",
    aboutTitle: "About / diagnostics",
    aboutDescription: "A compact view of the bridge service and its deployed component.",
    serviceStarting: "Service starting",
    serviceReady: "Service connected",
    serviceUnavailable: "Service unavailable",
    managerCountLabel: "available download managers",
    detectionIdle: "Current detection cache",
    detectionLoading: "Scanning for download managers...",
    detectionSuccess: "Scan complete: %s manager(s)",
    detectionError: "Scan failed: %s",
    noManagers: "No supported download manager was detected",
    defaultManagerEyebrow: "default route",
    defaultManagerTitle: "Default download manager",
    defaultManagerLabel: "Default tool for the DownloadIt context menu",
    defaultManagerHelp: "DownloadIt sends links to the manager selected here.",
    refreshManagers: "Detect again",
    availableEyebrow: "live scan",
    availableTitle: "Detected tools",
    managerDefault: "default",
    noManagerOption: "No available download manager",
    locked: "Locked by Firefox policy",
    privacyEyebrow: "request headers",
    sendCookiesTitle: "Send cookies to download managers",
    sendCookiesHelp: "Preserve the current site's login state for downloads that require it.",
    cookieLocked: "This setting is locked by a Firefox policy.",
    automaticEyebrow: "automatic handling",
    automaticTitle: "Forwarded with each task",
    refererTitle: "Referer",
    userAgentTitle: "User-Agent",
    automaticLabel: "automatically attached",
    automaticHelp: "These values help the external manager reproduce the request made by the current page.",
    aboutEyebrow: "runtime details",
    versionLabel: "Extension version",
    platformLabel: "Platform support",
    serviceLabel: "Background service",
    binaryLabel: "Component path",
    windows: "Windows",
    unsupportedPlatform: "Windows only",
    ready: "Ready",
    starting: "Starting",
    unavailable: "Unavailable",
    aboutCalloutTitle: "DownloadIt connects Firefox to external download tools.",
    aboutCalloutHelp: "If the list is empty, install a supported manager and detect again.",
    noChanges: "No changes to apply",
    unsavedChanges: "Changes are ready to apply",
    applied: "Settings applied",
    applying: "Applying settings...",
    cancel: "Cancel",
    apply: "Apply",
    errorLockedDefault: "The default manager preference is locked.",
    errorLockedCookies: "The cookie preference is locked.",
    errorUnsupportedManager: "The selected manager is no longer available.",
    errorService: "The DownloadIt service is not ready.",
  },
  "zh-CN": {
    brandSubtitle: "下载桥接器",
    navLabel: "设置分区",
    navManagers: "下载管理器",
    navPrivacy: "请求与隐私",
    navAbout: "关于 / 诊断",
    managerKicker: "01 / 运行状态",
    managerTitle: "下载管理器",
    managerDescription: "选择用于右键下载的默认工具，并查看当前系统可用的下载管理器。",
    privacyKicker: "02 / 请求策略",
    privacyTitle: "请求与隐私",
    privacyDescription: "选择哪些浏览器请求信息会传递给外部下载工具。",
    aboutKicker: "03 / 服务信息",
    aboutTitle: "关于 / 诊断",
    aboutDescription: "查看桥接服务和已部署组件的运行状态。",
    serviceStarting: "后台服务启动中",
    serviceReady: "后台服务已连接",
    serviceUnavailable: "后台服务不可用",
    managerCountLabel: "个可用下载工具",
    detectionIdle: "当前检测缓存",
    detectionLoading: "正在检测下载工具...",
    detectionSuccess: "检测完成：%s 个工具",
    detectionError: "检测失败：%s",
    noManagers: "未检测到支持的下载工具",
    defaultManagerEyebrow: "默认路由",
    defaultManagerTitle: "默认下载工具",
    defaultManagerLabel: "DownloadIt 右键菜单中的默认工具",
    defaultManagerHelp: "DownloadIt 会将链接发送到这里选择的工具。",
    refreshManagers: "重新检测",
    availableEyebrow: "实时扫描",
    availableTitle: "已发现的工具",
    managerDefault: "默认",
    noManagerOption: "暂无可用下载工具",
    locked: "由 Firefox 策略锁定",
    privacyEyebrow: "请求头",
    sendCookiesTitle: "向下载工具发送 Cookies",
    sendCookiesHelp: "保留当前站点的登录状态，用于下载需要登录的文件。",
    cookieLocked: "此设置已由 Firefox 策略锁定。",
    automaticEyebrow: "自动处理",
    automaticTitle: "随任务传递的信息",
    refererTitle: "Referer",
    userAgentTitle: "User-Agent",
    automaticLabel: "自动附带",
    automaticHelp: "这些信息用于让外部下载工具复现当前页面的下载请求。",
    aboutEyebrow: "运行信息",
    versionLabel: "扩展版本",
    platformLabel: "平台支持",
    serviceLabel: "后台服务",
    binaryLabel: "组件路径",
    windows: "Windows",
    unsupportedPlatform: "仅支持 Windows",
    ready: "已就绪",
    starting: "启动中",
    unavailable: "不可用",
    aboutCalloutTitle: "DownloadIt 正在连接 Firefox 与外部下载工具。",
    aboutCalloutHelp: "如果下载工具列表为空，请确认下载工具已安装后重新检测。",
    noChanges: "没有待应用的修改",
    unsavedChanges: "有待应用的修改",
    applied: "设置已应用",
    applying: "正在应用设置...",
    cancel: "取消",
    apply: "应用",
    errorLockedDefault: "默认下载工具偏好已被锁定。",
    errorLockedCookies: "Cookie 偏好已被锁定。",
    errorUnsupportedManager: "所选下载工具已不可用。",
    errorService: "DownloadIt 后台服务尚未就绪。",
  },
};

const SECTION_META = {
  managers: ["managerKicker", "managerTitle", "managerDescription"],
  privacy: ["privacyKicker", "privacyTitle", "privacyDescription"],
  about: ["aboutKicker", "aboutTitle", "aboutDescription"],
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
  feedback: "",
  feedbackKind: "",
};

let renderedManagerNames = null;

const appLocale = globalThis.Services?.locale?.appLocaleAsBCP47 ||
  globalThis.navigator?.language ||
  "en-US";
const locale = appLocale.toLowerCase().startsWith("zh")
  ? "zh-CN"
  : "en-US";
const strings = TEXT[locale];

function text(key, ...values) {
  let value = strings[key] || TEXT["en-US"][key] || key;
  for (const replacement of values) {
    value = value.replace("%s", String(replacement));
  }
  return value;
}

function applyLocale() {
  document.documentElement.lang = locale;
  document.title = "DownloadIt";
  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = text(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll("[data-i18n-aria-label]")) {
    element.setAttribute("aria-label", text(element.dataset.i18nAriaLabel));
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
  state.feedback = "";
  state.feedbackKind = "";
}

function render() {
  const meta = SECTION_META[state.section];
  document.getElementById("section-kicker").textContent = text(meta[0]);
  document.getElementById("section-title").textContent = text(meta[1]);
  document.getElementById("section-description").textContent = text(meta[2]);

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
    changeState.textContent = state.feedback;
    changeState.classList.add(state.feedbackKind === "error" ? "is-error" : "is-success");
  } else if (state.busy) {
    changeState.textContent = text("applying");
  } else if (dirty) {
    changeState.textContent = text("unsavedChanges");
    changeState.classList.add("is-dirty");
  } else {
    changeState.textContent = text("noChanges");
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
    sidebarStatus.textContent = text("serviceUnavailable");
    sidebarDot.classList.add("is-error");
    serviceStatus.textContent = text("unavailable");
    serviceStatus.className = "is-error";
    platformStatus.textContent = text("unsupportedPlatform");
    return;
  }

  if (service.serviceReady) {
    sidebarStatus.textContent = text("serviceReady");
    sidebarDot.classList.add("is-ready");
    serviceStatus.textContent = text("ready");
    serviceStatus.className = "is-ready";
  } else {
    sidebarStatus.textContent = text("serviceStarting");
    sidebarDot.classList.add("is-pending");
    serviceStatus.textContent = text("starting");
    serviceStatus.className = "is-pending";
  }
  platformStatus.textContent = service.platformSupported
    ? text("windows")
    : text("unsupportedPlatform");
}

function renderManagers() {
  const snapshot = state.snapshot;
  const managers = snapshot?.managers || [];
  const select = document.getElementById("default-manager");
  const popup = document.getElementById("default-manager-popup");
  const list = document.getElementById("manager-list");
  const count = document.getElementById("manager-count");
  const managerState = document.getElementById("manager-state");
  const refreshButton = document.getElementById("refresh-managers");
  const defaultLock = document.getElementById("default-manager-lock");

  count.textContent = String(managers.length);
  const managersChanged = renderedManagerNames === null ||
    renderedManagerNames.length !== managers.length ||
    renderedManagerNames.some((manager, index) => manager !== managers[index]);
  if (managersChanged) {
    popup.replaceChildren();
    if (!managers.length) {
      const item = createXULElement("menuitem");
      item.setAttribute("label", text("noManagerOption"));
      item.setAttribute("value", "");
      popup.append(item);
    } else {
      for (const manager of managers) {
        const item = createXULElement("menuitem");
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
    managerState.textContent = text("detectionLoading");
  } else if (state.scanState === "error") {
    managerState.textContent = text("detectionError", state.scanMessage);
    managerState.classList.add("is-error");
  } else if (state.scanState === "success") {
    managerState.textContent = text("detectionSuccess", managers.length);
    managerState.classList.add("is-success");
  } else if (!managers.length) {
    managerState.textContent = text("noManagers");
  } else {
    managerState.textContent = text("detectionIdle");
  }

  list.replaceChildren();
  if (!managers.length) {
    const empty = document.createElement("li");
    empty.className = "empty-row";
    empty.innerHTML = `<span class="empty-mark">--</span><span>${text("noManagers")}</span>`;
    list.append(empty);
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
      badge.textContent = text("managerDefault");
      row.append(badge);
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

function errorMessage(error) {
  const message = String(error?.message || error || "");
  if (/default download manager preference is locked/i.test(message)) {
    return text("errorLockedDefault");
  }
  if (/cookie preference is locked/i.test(message)) {
    return text("errorLockedCookies");
  }
  if (/unsupported download manager/i.test(message)) {
    return text("errorUnsupportedManager");
  }
  if (!message) {
    return text("errorService");
  }
  return message;
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
    state.scanMessage = errorMessage(error);
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
    setFeedback(text("errorUnsupportedManager"), "error");
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
    setFeedback(text("applied"), "success");
  } catch (error) {
    setFeedback(errorMessage(error), "error");
  } finally {
    state.busy = false;
  }
  render();
}

function init() {
  applyLocale();
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
}

window.addEventListener("DOMContentLoaded", init, { once: true });
})();

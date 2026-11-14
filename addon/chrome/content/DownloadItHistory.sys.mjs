const PLACES_URL = "chrome://browser/content/places/places.xhtml";
export const HISTORY_CLEANUP_PREF = "downloadit.history.showCleanupButtons";

// Use the native shell command so both session and Places records are removed.
// Never remove target files or cancel downloads here.
export async function cleanDownloadHistory(elements, kind, active = () => true) {
  for (const element of elements) {
    if (!active()) break;
    const shell = element?._shell;
    const download = shell?.download;
    try {
      if (kind === "unavailable") {
        if (!download?.succeeded || !download.target?.path) continue;
        await download.refresh();
        if (!active() || !download.succeeded || download.target.exists !== false) continue;
      } else if (kind !== "failed" || !download?.error) {
        continue;
      }
      if (shell.isCommandEnabled("cmd_delete")) shell.doCommand("cmd_delete");
    } catch (error) {
      console.error("DownloadIt: history cleanup failed", error);
    }
  }
}

export class DownloadItHistoryController {
  constructor(window, initializeLocalization) {
    this.window = window;
    this.document = window.document;
    this.initializeLocalization = initializeLocalization;
    this.buttons = [];
    this.destroyed = false;
    this.busy = false;
  }

  async init() {
    await this.initializeLocalization(this.window);
    await this.document.l10n.ready;
    if (this.destroyed || this.window.closed) return;
    this.observer = new this.window.MutationObserver(() => this.update());
    this.observer.observe(this.document.documentElement, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ["hidden", "state"],
    });
    this.onSelect = () => this.update();
    this.document.addEventListener("select", this.onSelect, true);
    this.update();
  }

  update() {
    if (this.destroyed) return;
    const clear = this.document.getElementById("clearDownloadsButton");
    if (!clear) return;
    if (!this.buttons.length) {
      let previous = clear;
      for (const kind of ["failed", "unavailable"]) {
        const button = this.document.createXULElement("toolbarbutton");
        button.id = `downloadit-history-${kind}`;
        button.classList.add("tabbable");
        button.style.marginInlineStart = "4px";
        this.document.l10n.setAttributes(button, `downloadit-history-remove-${kind}`);
        button.addEventListener("command", () => this.clean(kind));
        previous.after(button);
        this.buttons.push(button);
        previous = button;
      }
    }
    const elements = this.elements();
    this.buttons.forEach((button, index) => {
      if (button.hidden !== clear.hidden) button.hidden = clear.hidden;
      button.disabled = this.busy || !elements.some(element => {
        const download = element?._shell?.download;
        return index === 0 ? Boolean(download?.error)
          : Boolean(download?.succeeded && download.target?.path);
      });
    });
  }

  elements() {
    return Array.from(this.document.getElementById("downloadsListBox")?.children || []);
  }

  async clean(kind) {
    if (this.busy || this.destroyed) return;
    this.busy = true;
    this.update();
    try {
      await cleanDownloadHistory(this.elements(), kind, () => !this.destroyed);
    } finally {
      this.busy = false;
      this.update();
    }
  }

  destroy() {
    this.destroyed = true;
    this.observer?.disconnect();
    if (this.onSelect) this.document.removeEventListener("select", this.onSelect, true);
    for (const button of this.buttons) button.remove();
    this.buttons = [];
  }
}

export class DownloadItHistoryIntegration {
  constructor(services, initializeLocalization) {
    this.services = services;
    this.initializeLocalization = initializeLocalization;
    this.controllers = new Map();
    this.pending = new Map();
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.services.obs.addObserver(this, "domwindowopened");
    this.services.obs.addObserver(this, "domwindowclosed");
    this.services.prefs.addObserver(HISTORY_CLEANUP_PREF, this);
    this.sync();
  }

  observe(subject, topic) {
    if (topic === "nsPref:changed") this.sync();
    else if (topic === "domwindowclosed") {
      const onLoad = this.pending.get(subject);
      if (onLoad) subject.removeEventListener("load", onLoad);
      this.pending.delete(subject);
      this.controllers.get(subject)?.onUnload();
    } else if (topic === "domwindowopened") this.watch(subject, true);
  }

  sync() {
    this.enabled = this.services.prefs.getBoolPref(HISTORY_CLEANUP_PREF, true);
    if (!this.enabled) {
      this.clear();
      return;
    }
    const windows = this.services.wm.getEnumerator(null);
    while (windows.hasMoreElements()) this.watch(windows.getNext());
  }

  watch(window, opening = false) {
    if (!this.enabled || window.closed || this.controllers.has(window) || this.pending.has(window)) return;
    // domwindowopened can expose a complete initial about:blank document.
    // Its readyState says nothing about the requested chrome document.
    if (opening || window.document.readyState !== "complete") {
      const onLoad = event => {
        if (event.target !== window.document || window.location.href === "about:blank") return;
        window.removeEventListener("load", onLoad);
        this.pending.delete(window);
        this.watch(window);
      };
      this.pending.set(window, onLoad);
      window.addEventListener("load", onLoad);
      return;
    }
    if (window.location.href !== PLACES_URL) return;
    const controller = new DownloadItHistoryController(window, this.initializeLocalization);
    const onUnload = () => {
      controller.destroy();
      this.controllers.delete(window);
    };
    this.controllers.set(window, { controller, onUnload });
    window.addEventListener("unload", onUnload, { once: true });
    controller.init().catch(error => {
      console.error("DownloadIt: history initialization failed", error);
      window.removeEventListener("unload", onUnload);
      onUnload();
    });
  }

  clear() {
    for (const [window, onLoad] of this.pending) window.removeEventListener("load", onLoad);
    this.pending.clear();
    for (const [window, { controller, onUnload }] of this.controllers) {
      window.removeEventListener("unload", onUnload);
      controller.destroy();
    }
    this.controllers.clear();
  }

  stop() {
    this.enabled = false;
    if (this.started) {
      this.services.obs.removeObserver(this, "domwindowopened");
      this.services.obs.removeObserver(this, "domwindowclosed");
      this.services.prefs.removeObserver(HISTORY_CLEANUP_PREF, this);
      this.started = false;
    }
    this.clear();
  }
}

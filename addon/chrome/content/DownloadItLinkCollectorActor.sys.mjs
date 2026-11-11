const SELECTION_QUERY = "DownloadIt:GetSelectionLinks";
const PAGE_LINKS_QUERY = "DownloadIt:GetPageLinks";
const VIDEO_BUTTON_LABEL_QUERY = "DownloadIt:GetVideoButtonLabel";
const VIDEO_BUTTON_SETTING_MESSAGE = "DownloadIt:SetVideoButtonEnabled";
const VIDEO_DOWNLOAD_MESSAGE = "DownloadIt:DownloadVideo";
const YTDLP_PROBE_MESSAGE = "DownloadIt:ProbeYtDlpPage";
const YTDLP_SETTING_MESSAGE = "DownloadIt:SetYtDlpEnabled";
const KNOWN_YTDLP_HOSTS = Object.freeze([
  "youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
]);

export function isKnownYtDlpPage(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return KNOWN_YTDLP_HOSTS.some(host =>
      hostname === host || hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

const ParentActor = typeof JSWindowActorParent === "function"
  ? JSWindowActorParent
  : class {};
const ChildActor = typeof JSWindowActorChild === "function"
  ? JSWindowActorChild
  : class {};

function nodeIsWithinSelection(range, node) {
  try {
    return range.intersectsNode(node);
  } catch {
    return false;
  }
}

function linkDescription(element, url) {
  for (const value of [
    element.textContent,
    element.getAttribute?.("aria-label"),
    element.getAttribute?.("title"),
    element.getAttribute?.("alt"),
  ]) {
    const description = String(value || "").trim();
    if (description) {
      return description;
    }
  }
  return url;
}

function collectRootLinks(root, links) {
  for (const element of root?.querySelectorAll?.("a[href], area[href]") || []) {
    const url = element.href;
    if (!url) {
      continue;
    }
    links.push({
      url,
      description: linkDescription(element, url),
      filename: element.getAttribute?.("download") || "",
    });
  }

  for (const element of root?.querySelectorAll?.("*") || []) {
    if (element.shadowRoot) {
      collectRootLinks(element.shadowRoot, links);
    }
  }
}

export function collectPageLinks(document) {
  const links = [];
  collectRootLinks(document, links);
  return links;
}

export function collectSelectionLinks(document) {
  const selection = document?.defaultView?.getSelection?.();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return [];
  }

  const ranges = Array.from({ length: selection.rangeCount }, (_, index) =>
    selection.getRangeAt(index)
  );
  const links = [];

  for (const element of document.querySelectorAll("a[href], area[href]")) {
    if (!ranges.some(range => nodeIsWithinSelection(range, element))) {
      continue;
    }

    const url = element.href;
    if (!url) {
      continue;
    }
    links.push({
      url,
      description: element.textContent?.trim() || url,
      filename: element.getAttribute("download") || "",
    });
  }

  return links;
}

export class DownloadItLinkCollectorParent extends ParentActor {
  async receiveMessage({ name, data }) {
    if (name === "DownloadIt:GetVideoButtonEnabled") {
      try {
        const { getActiveService } = ChromeUtils.importESModule(
          "chrome://downloadit/content/DownloadItService.sys.mjs",
        );
        return getActiveService()?.videoDownloadButtonEnabled !== false;
      } catch {
        return true;
      }
    }
    if (name === VIDEO_BUTTON_LABEL_QUERY) {
      const browserWindow = this.browsingContext?.top?.embedderElement
        ?.ownerDocument?.defaultView;
      if (!browserWindow) {
        return "";
      }
      const { initializeDownloadItLocalization } = ChromeUtils.importESModule(
        "chrome://downloadit/content/DownloadItLocalization.sys.mjs",
      );
      await initializeDownloadItLocalization(browserWindow);
      return await browserWindow?.document?.l10n?.formatValue(
        "downloadit-ytdlp-download",
      ) || "";
    }
    if (name === "DownloadIt:GetYtDlpEnabled") {
      try {
        const { getActiveService } = ChromeUtils.importESModule(
          "chrome://downloadit/content/DownloadItService.sys.mjs",
        );
        return getActiveService()?.ytDlpEnabled === true;
      } catch {
        return false;
      }
    }
    if (name === YTDLP_PROBE_MESSAGE) {
      const { getActiveService } = ChromeUtils.importESModule(
        "chrome://downloadit/content/DownloadItService.sys.mjs",
      );
      const pageURL = this.browsingContext?.currentWindowGlobal?.documentURI?.spec || "";
      return getActiveService()?.probeYtDlpPage(pageURL) || false;
    }
    if (name !== VIDEO_DOWNLOAD_MESSAGE) {
      return null;
    }

    const browser = this.browsingContext?.top?.embedderElement;
    const browserWindow = browser?.ownerDocument?.defaultView;
    if (!browser || !browserWindow) {
      return null;
    }

    try {
      const { getActiveService } = ChromeUtils.importESModule(
        "chrome://downloadit/content/DownloadItService.sys.mjs",
      );
      const service = getActiveService();
      const pageURL = this.browsingContext?.currentWindowGlobal?.documentURI?.spec || "";
      if (!service?.ytDlpEnabled || !/^https?:/i.test(pageURL)) {
        throw new Error("yt-dlp is unavailable or the page URL is invalid");
      }
      await service.downloadViaYtDlp(pageURL);
    } catch (error) {
      console.error("DownloadIt: video download failed", error);
      let label = "";
      try {
        label = await browserWindow.document.l10n.formatValue(
          "downloadit-video-download-failed",
        );
      } catch {}
      if (!label) {
        return null;
      }
      const { showDownloadItToast } = ChromeUtils.importESModule(
        "chrome://downloadit/content/DownloadItChrome.sys.mjs",
      );
      showDownloadItToast(browserWindow, label);
    }
  }
}

export function getPlayableVideoURL(video) {
  const value = String(video?.currentSrc || video?.src || "").trim();
  if (!value) {
    return "";
  }
  try {
    const url = new URL(value, video.ownerDocument?.baseURI);
    return ["http:", "https:", "ftp:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export class DownloadItLinkCollectorChild extends ChildActor {
  actorName = "DownloadItLinkCollector";
  video = null;
  host = null;
  button = null;
  hideTimer = null;
  observer = null;
  label = "";
  videoButtonEnabled = false;
  ytDlpEnabled = false;
  supportProbeURL = "";
  supportProbeResult = false;
  destroyed = false;

  receiveMessage({ name, data }) {
    if (name === SELECTION_QUERY) {
      return collectSelectionLinks(this.document);
    }
    if (name === PAGE_LINKS_QUERY) {
      return collectPageLinks(this.document);
    }
    if (name === VIDEO_BUTTON_SETTING_MESSAGE) {
      this.setVideoButtonEnabled(data?.enabled === true);
      return null;
    }
    if (name === YTDLP_SETTING_MESSAGE) {
      this.setYtDlpEnabled(data?.enabled === true);
      return null;
    }
    return null;
  }

  actorCreated() {
    if (!this.document?.documentElement) {
      return;
    }
    this.sendQuery("DownloadIt:GetVideoButtonEnabled").then(enabled => {
      if (this.destroyed) {
        return;
      }
      this.setVideoButtonEnabled(enabled !== false);
    }).catch(() => {
      if (!this.destroyed) {
        this.setVideoButtonEnabled(true);
      }
    });
    this.sendQuery("DownloadIt:GetYtDlpEnabled").then(enabled => {
      if (!this.destroyed) {
        this.setYtDlpEnabled(enabled === true);
      }
    }).catch(() => this.setYtDlpEnabled(false));
  }

  didDestroy() {
    this.destroyed = true;
    this.cleanupVideoButton();
  }

  setVideoButtonEnabled(enabled) {
    if (this.videoButtonEnabled === enabled) {
      return;
    }
    this.videoButtonEnabled = enabled;
    if (enabled) {
      this.installVideoButton();
    } else {
      this.cleanupVideoButton();
    }
  }

  installVideoButton() {
    const document = this.document;
    const view = document.defaultView;
    this.ensureVideoButton();
    this.sendQuery(VIDEO_BUTTON_LABEL_QUERY).catch(() => "").then(label => {
      if (!label || this.destroyed) {
        return;
      }
      this.label = label;
      if (this.button?.querySelector("span")) {
        this.button.querySelector("span").textContent = this.label;
        this.button.setAttribute("aria-label", this.label);
        this.button.title = this.label;
        this.button.hidden = false;
      }
    });
    document.addEventListener("pointerover", this, true);
    document.addEventListener("pointerout", this, true);
    document.addEventListener("loadedmetadata", this, true);
    document.addEventListener("loadstart", this, true);
    document.addEventListener("emptied", this, true);
    document.addEventListener("visibilitychange", this, true);
    view?.addEventListener("scroll", this, true);
    view?.addEventListener("resize", this, true);
    this.observer = new view.MutationObserver(() => {
      this.refreshVideo();
      this.probeCurrentPage();
    });
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  setYtDlpEnabled(enabled) {
    this.ytDlpEnabled = enabled;
    this.supportProbeURL = "";
    this.supportProbeResult = false;
    if (!enabled) {
      this.hideVideoButton();
    } else {
      this.probeCurrentPage();
    }
  }

  ensureVideoButton() {
    const document = this.document;
    this.host = document.createElement("div");
    this.host.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;display:none";
    const shadow = this.host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `button{align-items:center;background:rgba(24,32,48,.94);border:0;border-radius:6px;color:#fff;cursor:pointer;display:flex;font:13px/1.2 system-ui,sans-serif;gap:6px;padding:8px 11px;box-shadow:0 2px 8px #0006}button:hover{background:#25385f}button:focus-visible{outline:2px solid #7ab7ff;outline-offset:2px}svg{fill:none;height:16px;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:2;width:16px}`;
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.hidden = true;
    this.button.setAttribute("aria-label", this.label);
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M12 3v12m0 0 5-5m-5 5-5-5M5 21h14");
    icon.appendChild(path);
    const text = document.createElement("span");
    text.textContent = this.label;
    this.button.append(icon, text);
    shadow.append(style, this.button);
    this.host.addEventListener("pointerenter", () => this.cancelHide());
    this.host.addEventListener("pointerleave", () => this.scheduleHide());
    this.button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const pageURL = this.document?.location?.href || "";
      if (this.ytDlpEnabled && this.supportProbeResult && pageURL) {
        this.sendAsyncMessage(VIDEO_DOWNLOAD_MESSAGE, { pageURL });
      }
      this.hideVideoButton();
    });
    (document.body || document.documentElement).appendChild(this.host);
  }

  handleEvent(event) {
    if (event.type === "pointerover") {
      const video = event.composedPath?.().find(node => node?.localName === "video");
      if (video && this.ytDlpEnabled) {
        this.checkPageSupport(video);
      }
      return;
    }
    if (event.type === "pointerout") {
      if (event.target === this.video && !this.host?.contains(event.relatedTarget)) {
        this.scheduleHide();
      }
      return;
    }
    if (event.type === "loadedmetadata" || event.type === "loadstart" || event.type === "emptied") {
      this.refreshVideo(event.target);
      return;
    }
    if (event.type === "visibilitychange" && this.document.hidden) {
      this.hideVideoButton();
      return;
    }
    if (this.video && this.host?.style.display !== "none") {
      this.positionVideoButton();
    }
  }

  checkPageSupport(video) {
    const pageURL = this.document?.location?.href || "";
    if (!/^https?:/i.test(pageURL)) {
      return;
    }
    this.video = video;
    this.probeCurrentPage();
    if (this.supportProbeURL === pageURL && this.supportProbeResult) {
      this.showVideoButton(video);
    }
  }

  probeCurrentPage() {
    if (!this.ytDlpEnabled) {
      return;
    }
    const pageURL = this.document?.location?.href || "";
    if (!/^https?:/i.test(pageURL) || this.supportProbeURL === pageURL) {
      return;
    }
    this.supportProbeURL = pageURL;
    this.supportProbeResult = isKnownYtDlpPage(pageURL);
    if (this.supportProbeResult) {
      if (this.video?.isConnected) {
        this.showVideoButton(this.video);
      }
      return;
    }
    this.sendQuery(YTDLP_PROBE_MESSAGE, { pageURL }).then(supported => {
      if (this.destroyed || this.supportProbeURL !== pageURL) {
        return;
      }
      this.supportProbeResult = supported === true;
      if (this.supportProbeResult && this.video?.isConnected) {
        this.showVideoButton(this.video);
      } else {
        this.hideVideoButton();
      }
    }).catch(() => this.hideVideoButton());
  }

  showVideoButton(video) {
    if (!this.label) {
      return;
    }
    this.cancelHide();
    this.video = video;
    this.host.style.display = "block";
    this.positionVideoButton();
  }

  positionVideoButton() {
    const video = this.video;
    if (!video?.isConnected) {
      this.hideVideoButton();
      return;
    }
    const rect = video.getBoundingClientRect();
    if (rect.width < 24 || rect.height < 24 || rect.bottom <= 0 || rect.right <= 0 ||
        rect.top >= this.document.defaultView.innerHeight || rect.left >= this.document.defaultView.innerWidth) {
      this.hideVideoButton();
      return;
    }
    this.host.style.left = `${Math.max(0, rect.left + 10)}px`;
    this.host.style.top = `${Math.max(0, rect.top + 10)}px`;
  }

  refreshVideo(video = this.video) {
    if (this.video && !this.video.isConnected) {
      this.hideVideoButton();
    }
  }

  scheduleHide() {
    this.cancelHide();
    this.hideTimer = this.document.defaultView.setTimeout(() => this.hideVideoButton(), 350);
  }

  cancelHide() {
    if (this.hideTimer !== null) {
      this.document.defaultView.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  hideVideoButton() {
    this.cancelHide();
    this.video = null;
    if (this.host) {
      this.host.style.display = "none";
    }
  }

  cleanupVideoButton() {
    this.hideVideoButton();
    this.observer?.disconnect();
    this.observer = null;
    const document = this.document;
    document?.removeEventListener("pointerover", this, true);
    document?.removeEventListener("pointerout", this, true);
    document?.removeEventListener("loadedmetadata", this, true);
    document?.removeEventListener("loadstart", this, true);
    document?.removeEventListener("emptied", this, true);
    document?.removeEventListener("visibilitychange", this, true);
    document?.defaultView?.removeEventListener("scroll", this, true);
    document?.defaultView?.removeEventListener("resize", this, true);
    this.host?.remove();
    this.host = null;
    this.button = null;
  }
}

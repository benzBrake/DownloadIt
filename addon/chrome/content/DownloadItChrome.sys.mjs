const XHTML_NS = "http://www.w3.org/1999/xhtml";
const TOAST_HOST_ID = "downloadit-toast-host";
const TOAST_TIMEOUT_MS = 3500;
const TOAST_STYLESHEET_URL = "chrome://downloadit/content/chrome.css";
const styledWindows = new WeakSet();

function createElement(document, name) {
  return document.createElementNS(XHTML_NS, name);
}

function localize(document, element, id, args = null) {
  document.l10n?.setAttributes(element, id, args);
}

function installToastStylesheet(window) {
  if (styledWindows.has(window)) {
    return true;
  }
  const windowUtils = window?.windowUtils;
  if (
    !windowUtils ||
    typeof windowUtils.loadSheetUsingURIString !== "function" ||
    windowUtils.AUTHOR_SHEET == null
  ) {
    return false;
  }
  windowUtils.loadSheetUsingURIString(
    TOAST_STYLESHEET_URL,
    windowUtils.AUTHOR_SHEET,
  );
  styledWindows.add(window);
  return true;
}

function ensureToastHost(window) {
  const document = window?.document;
  if (!document?.documentElement || !installToastStylesheet(window)) {
    return null;
  }

  let host = document.getElementById(TOAST_HOST_ID);
  if (!host) {
    host = createElement(document, "div");
    host.id = TOAST_HOST_ID;
    host.setAttribute("aria-live", "polite");
    host.setAttribute("aria-relevant", "additions");
    (document.body || document.documentElement).appendChild(host);
  }
  return host;
}

export function showDownloadItToast(window, message, options = null) {
  const host = ensureToastHost(window);
  if (!host) {
    return false;
  }

  const onClick = typeof options?.onClick === "function"
    ? options.onClick
    : null;
  const document = window.document;
  const toast = createElement(document, "div");
  const content = createElement(document, "div");
  const title = createElement(document, "div");
  const body = createElement(document, "div");
  const close = createElement(document, "button");
  let dismissTimer = null;
  let dismissed = false;

  const dismiss = () => {
    if (dismissed) {
      return;
    }
    dismissed = true;
    if (dismissTimer !== null) {
      window.clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    toast.classList.remove("is-visible");
    window.setTimeout(() => toast.remove(), 160);
  };
  const activate = event => {
    if (!onClick || dismissed || event.target === close) {
      return;
    }
    if (
      event.type === "keydown" &&
      event.key !== "Enter" &&
      event.key !== " "
    ) {
      return;
    }
    event.preventDefault?.();
    try {
      Promise.resolve(onClick()).catch(error => {
        console.error("DownloadIt: toast action failed", error);
      });
    } catch (error) {
      console.error("DownloadIt: toast action failed", error);
    }
    dismiss();
  };
  const scheduleDismiss = () => {
    if (dismissTimer !== null) {
      window.clearTimeout(dismissTimer);
    }
    dismissTimer = window.setTimeout(dismiss, TOAST_TIMEOUT_MS);
  };

  toast.className = "downloadit-toast";
  toast.setAttribute("role", onClick ? "button" : "status");
  if (onClick) {
    toast.classList.add("is-actionable");
    toast.setAttribute("tabindex", "0");
    localize(document, toast, "downloadit-toast-open-ariang");
  }
  content.className = "downloadit-toast-content";
  title.className = "downloadit-toast-title";
  body.className = "downloadit-toast-message";
  close.className = "downloadit-toast-close";
  close.type = "button";
  close.textContent = "\u00d7";
  localize(document, title, "downloadit-toast-title");
  localize(document, close, "downloadit-toast-close");
  body.textContent = String(message);
  content.append(title, body);
  toast.append(content, close);
  close.addEventListener("click", event => {
    event.stopPropagation?.();
    dismiss();
  }, { once: true });
  if (onClick) {
    toast.addEventListener("click", activate);
    toast.addEventListener("keydown", activate);
  }
  toast.addEventListener("mouseenter", () => {
    if (dismissTimer !== null) {
      window.clearTimeout(dismissTimer);
      dismissTimer = null;
    }
  });
  toast.addEventListener("mouseleave", scheduleDismiss);

  host.appendChild(toast);
  const reveal = () => toast.classList.add("is-visible");
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(reveal);
  } else {
    reveal();
  }
  scheduleDismiss();
  return true;
}

export function destroyDownloadItToasts(window) {
  window?.document?.getElementById(TOAST_HOST_ID)?.remove();
  if (!styledWindows.has(window)) {
    return;
  }

  const windowUtils = window?.windowUtils;
  try {
    windowUtils?.removeSheetUsingURIString?.(
      TOAST_STYLESHEET_URL,
      windowUtils.AUTHOR_SHEET,
    );
  } catch (error) {
    console.error("DownloadIt: toast stylesheet cleanup failed", error);
  }
  styledWindows.delete(window);
}

const XHTML_NS = "http://www.w3.org/1999/xhtml";
const TOAST_HOST_ID = "downloadit-toast-host";
const TOAST_STYLE_ID = "downloadit-toast-style";
const TOAST_TIMEOUT_MS = 3500;

function createElement(document, name) {
  return document.createElementNS(XHTML_NS, name);
}

function localize(document, element, id, args = null) {
  document.l10n?.setAttributes(element, id, args);
}

function ensureToastHost(window) {
  const document = window?.document;
  if (!document?.documentElement) {
    return null;
  }

  let style = document.getElementById(TOAST_STYLE_ID);
  if (!style) {
    style = createElement(document, "style");
    style.id = TOAST_STYLE_ID;
    style.textContent = `
      #${TOAST_HOST_ID} {
        position: fixed;
        inset-inline-end: 16px;
        inset-block-end: 16px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: flex-end;
        pointer-events: none;
      }
      #${TOAST_HOST_ID} .downloadit-toast {
        box-sizing: border-box;
        display: grid;
        grid-template-columns: minmax(0, 1fr) 28px;
        column-gap: 10px;
        width: min(380px, calc(100vw - 32px));
        padding: 11px 10px 11px 14px;
        color: var(--arrowpanel-color, CanvasText);
        background: var(--arrowpanel-background, Canvas);
        border: 1px solid var(--arrowpanel-border-color, color-mix(in srgb, CanvasText 22%, transparent));
        border-inline-start: 3px solid AccentColor;
        border-radius: 6px;
        box-shadow: 0 10px 24px color-mix(in srgb, CanvasText 22%, transparent);
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 160ms ease, transform 160ms ease;
        pointer-events: auto;
        font: menu;
      }
      #${TOAST_HOST_ID} .downloadit-toast.is-visible {
        opacity: 1;
        transform: translateY(0);
      }
      #${TOAST_HOST_ID} .downloadit-toast-content {
        min-width: 0;
      }
      #${TOAST_HOST_ID} .downloadit-toast-title {
        margin-block-end: 3px;
        font-weight: 600;
        line-height: 1.3;
      }
      #${TOAST_HOST_ID} .downloadit-toast-message {
        overflow-wrap: anywhere;
        line-height: 1.4;
      }
      #${TOAST_HOST_ID} .downloadit-toast-close {
        box-sizing: border-box;
        inline-size: 28px;
        block-size: 28px;
        padding: 0;
        border: 0;
        border-radius: 4px;
        color: inherit;
        background: transparent;
        cursor: pointer;
        font: menu;
        font-size: 18px;
        line-height: 1;
      }
      #${TOAST_HOST_ID} .downloadit-toast-close:hover {
        background: color-mix(in srgb, currentColor 12%, transparent);
      }
      #${TOAST_HOST_ID} .downloadit-toast-close:focus-visible {
        outline: 2px solid AccentColor;
        outline-offset: -2px;
      }
      @media (prefers-reduced-motion: reduce) {
        #${TOAST_HOST_ID} .downloadit-toast {
          transition: none;
        }
      }
    `;
    (document.body || document.documentElement).appendChild(style);
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

export function showDownloadItToast(window, message) {
  const host = ensureToastHost(window);
  if (!host) {
    return false;
  }

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
  const scheduleDismiss = () => {
    if (dismissTimer !== null) {
      window.clearTimeout(dismissTimer);
    }
    dismissTimer = window.setTimeout(dismiss, TOAST_TIMEOUT_MS);
  };

  toast.className = "downloadit-toast";
  toast.setAttribute("role", "status");
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
  close.addEventListener("click", dismiss, { once: true });
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

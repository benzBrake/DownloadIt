const SELECTION_QUERY = "DownloadIt:GetSelectionLinks";
const PAGE_LINKS_QUERY = "DownloadIt:GetPageLinks";

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

export class DownloadItLinkCollectorParent extends ParentActor {}

export class DownloadItLinkCollectorChild extends ChildActor {
  receiveMessage({ name }) {
    if (name === SELECTION_QUERY) {
      return collectSelectionLinks(this.document);
    }
    if (name === PAGE_LINKS_QUERY) {
      return collectPageLinks(this.document);
    }
    return null;
  }
}

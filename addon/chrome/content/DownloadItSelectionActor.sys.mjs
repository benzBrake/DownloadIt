const SELECTION_QUERY = "DownloadIt:GetSelectionLinks";

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

export class DownloadItSelectionParent extends ParentActor {}

export class DownloadItSelectionChild extends ChildActor {
  receiveMessage({ name }) {
    if (name !== SELECTION_QUERY) {
      return null;
    }
    return collectSelectionLinks(this.document);
  }
}

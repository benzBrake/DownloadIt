export function createXULElement(document, tagName, attributes = {}, children = []) {
  const element = document.createXULElement(tagName);
  for (const [name, value] of Object.entries(attributes)) {
    if (typeof value === "boolean") {
      if (value) {
        element.setAttribute(name, "true");
      } else {
        element.removeAttribute(name);
      }
    } else if (value !== undefined && value !== null) {
      element.setAttribute(name, String(value));
    }
  }
  element.append(...children);
  return element;
}

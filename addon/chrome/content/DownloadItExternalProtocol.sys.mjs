const CONTENT_DISPATCH_CHOOSER_MODULE =
  "resource://gre/modules/ContentDispatchChooser.sys.mjs";

let externalProtocolHook = null;

function getProtocol(uri) {
  const scheme = String(uri?.scheme || "").toLowerCase();
  if (scheme) {
    return scheme.replace(/:$/, "");
  }
  return String(uri?.spec || "").split(":", 1)[0].toLowerCase();
}

function isRoutedProtocol(protocol) {
  return protocol === "magnet" || protocol === "ed2k";
}

export function registerDownloadItExternalProtocolHook(
  service,
  { chooserConstructor = null } = {},
) {
  if (externalProtocolHook) {
    externalProtocolHook.service = service;
    return true;
  }

  let constructor = chooserConstructor;
  if (!constructor) {
    try {
      constructor = ChromeUtils.importESModule(
        CONTENT_DISPATCH_CHOOSER_MODULE,
      ).nsContentDispatchChooser;
    } catch (error) {
      console.error(
        "DownloadIt: Firefox external protocol module is unavailable",
        error,
      );
      return false;
    }
  }

  const prototype = constructor?.prototype;
  if (typeof prototype?.handleURI !== "function") {
    console.error(
      "DownloadIt: Firefox external protocol handle hook is unavailable",
    );
    return false;
  }

  const state = {
    service,
    prototype,
    originalHandleURI: prototype.handleURI,
    wrappedHandleURI: null,
  };

  state.wrappedHandleURI = function (...args) {
    const [, uri, principal, browsingContext, wasTriggeredExternally] = args;
    const protocol = getProtocol(uri);
    let manager = "";
    if (!wasTriggeredExternally && isRoutedProtocol(protocol)) {
      try {
        manager = state.service?.getProtocolDefaultManager?.(protocol) || "";
      } catch (error) {
        console.error(
          "DownloadIt: external protocol default lookup failed; showing Firefox UI",
          error,
        );
      }
    }
    if (!manager || typeof state.service?.downloadProtocolURI !== "function") {
      return state.originalHandleURI.apply(this, args);
    }

    return Promise.resolve()
      .then(() => state.service.downloadProtocolURI({
        uri,
        principal,
        browsingContext,
        manager,
      }))
      .catch(error => {
        console.error(
          "DownloadIt: automatic external protocol download failed; showing Firefox UI",
          error,
        );
        return state.originalHandleURI.apply(this, args);
      });
  };

  try {
    prototype.handleURI = state.wrappedHandleURI;
  } catch (error) {
    console.error(
      "DownloadIt: external protocol hook registration failed",
      error,
    );
    return false;
  }

  externalProtocolHook = state;
  return true;
}

export function unregisterDownloadItExternalProtocolHook(service) {
  const state = externalProtocolHook;
  if (!state || (service && state.service !== service)) {
    return;
  }

  state.service = null;
  if (state.prototype.handleURI === state.wrappedHandleURI) {
    state.prototype.handleURI = state.originalHandleURI;
  }
  externalProtocolHook = null;
}

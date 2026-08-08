const { Extension } = ChromeUtils.importESModule(
  "resource://gre/modules/Extension.sys.mjs",
);

const Services = globalThis.Services || ChromeUtils.importESModule(
  "resource://gre/modules/Services.sys.mjs",
).Services;

export const ARIANG_EXTENSION_ID = "downloadit-ariang@downloadit.invalid";
export const ARIANG_VERSION = "1.3.14";

const ARIANG_RESOURCE_PATH = "ariang/";
const ARIANG_PAGE_PATH = "index.html";
const ARIANG_ACTOR_NAME = "DownloadItAriaNg";
const ARIANG_ACTOR_URI =
  "chrome://downloadit/content/DownloadItAriaNgActor.sys.mjs";

let ariaNgExtension = null;
let startupPromise = null;
let shutdownPromise = null;
let ariaNgActorRegistered = false;

function registerAriaNgActor(pageURL) {
  if (ariaNgActorRegistered) {
    return;
  }

  const url = new URL(pageURL);
  if (url.protocol !== "moz-extension:" || !url.host) {
    throw new Error(`Unexpected AriaNg page URL: ${pageURL}`);
  }

  ChromeUtils.registerWindowActor(ARIANG_ACTOR_NAME, {
    parent: {
      esModuleURI: ARIANG_ACTOR_URI,
    },
    child: {
      esModuleURI: ARIANG_ACTOR_URI,
      events: {
        DOMContentLoaded: {},
        load: {},
      },
    },
    allFrames: false,
    matches: [`moz-extension://${url.host}/*`],
    safeForUntrustedWebProcess: true,
  });
  ariaNgActorRegistered = true;
}

function unregisterAriaNgActor() {
  if (!ariaNgActorRegistered) {
    return;
  }
  try {
    ChromeUtils.unregisterWindowActor(ARIANG_ACTOR_NAME);
  } catch {}
  ariaNgActorRegistered = false;
}

function createAriaNgAddonData(addonData) {
  const resourceURL = addonData.resourceURI.resolve(ARIANG_RESOURCE_PATH);
  return {
    id: ARIANG_EXTENSION_ID,
    version: ARIANG_VERSION,
    type: "extension",
    resourceURI: Services.io.newURI(resourceURL),
    isPrivileged: false,
    temporarilyInstalled: Boolean(addonData.temporarilyInstalled),
    blocklistState: addonData.blocklistState,
    startupData: {},
    TEST_NO_ADDON_MANAGER: true,
  };
}

export function getAriaNgURL() {
  const policy = ariaNgExtension?.policy;
  return policy?.active ? policy.getURL(ARIANG_PAGE_PATH) : "";
}

export async function startAriaNg(addonData, reason = "APP_STARTUP") {
  if (shutdownPromise) {
    await shutdownPromise;
  }
  if (ariaNgExtension?.policy?.active) {
    return getAriaNgURL();
  }
  if (startupPromise) {
    return startupPromise;
  }

  const ariaNgAddonData = createAriaNgAddonData(addonData);
  const extension = new Extension(ariaNgAddonData, reason);
  ariaNgExtension = extension;
  startupPromise = (async () => {
    try {
      await extension.startup();
      const pageURL = extension.policy.getURL(ARIANG_PAGE_PATH);
      registerAriaNgActor(pageURL);
      return pageURL;
    } catch (error) {
      if (ariaNgExtension === extension) {
        ariaNgExtension = null;
      }
      try {
        await extension.shutdown("ADDON_DISABLE");
      } catch {}
      unregisterAriaNgActor();
      throw error;
    } finally {
      startupPromise = null;
    }
  })();
  return startupPromise;
}

export async function stopAriaNg(reason = "ADDON_DISABLE") {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    if (startupPromise) {
      try {
        await startupPromise;
      } catch {
        return;
      }
    }

    const extension = ariaNgExtension;
    ariaNgExtension = null;
    try {
      if (extension) {
        await extension.shutdown(reason);
      }
    } finally {
      unregisterAriaNgActor();
    }
  })();

  try {
    await shutdownPromise;
  } finally {
    shutdownPromise = null;
  }
}

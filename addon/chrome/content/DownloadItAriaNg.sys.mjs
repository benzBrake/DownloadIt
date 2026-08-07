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

let ariaNgExtension = null;
let startupPromise = null;
let shutdownPromise = null;

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
      return extension.policy.getURL(ARIANG_PAGE_PATH);
    } catch (error) {
      if (ariaNgExtension === extension) {
        ariaNgExtension = null;
      }
      try {
        await extension.shutdown("ADDON_DISABLE");
      } catch {}
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
    if (extension) {
      await extension.shutdown(reason);
    }
  })();

  try {
    await shutdownPromise;
  } finally {
    shutdownPromise = null;
  }
}

/* exported install uninstall startup shutdown */
"use strict";

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

const Services = globalThis.Services || ChromeUtils.importESModule(
  "resource://gre/modules/Services.sys.mjs"
).Services;

const MODULE_URI = "chrome://downloadit/content/DownloadItService.sys.mjs";
const ARIANG_MODULE_URI = "chrome://downloadit/content/DownloadItAriaNg.sys.mjs";
const PROFILE_DIRECTORY = "DownloadIt";

let service = null;
let startupPromise = null;
let asyncShutdownBlocker = null;
let shutdownCompletedPromise = null;

function install() {}

function getLifecycleReason(reason, fallback) {
  const names = [
    "APP_STARTUP",
    "APP_SHUTDOWN",
    "ADDON_ENABLE",
    "ADDON_DISABLE",
    "ADDON_INSTALL",
    "ADDON_UNINSTALL",
    "ADDON_UPGRADE",
    "ADDON_DOWNGRADE",
  ];
  for (const name of names) {
    if (name in globalThis && globalThis[name] === reason) {
      return name;
    }
  }
  return fallback;
}

function startup(data, reason) {
  startupPromise = (async () => {
    let ariaNgModule;
    let serviceModule;
    try {
      ariaNgModule = ChromeUtils.importESModule(ARIANG_MODULE_URI);
      serviceModule = ChromeUtils.importESModule(MODULE_URI);
      await ariaNgModule.startAriaNg(
        data,
        getLifecycleReason(reason, "APP_STARTUP"),
      );
      const {
        DownloadItService,
        registerActiveService,
        unregisterActiveService,
      } = serviceModule;
      service = new DownloadItService(data);
      registerActiveService(service);
      await service.startup();
    } catch (error) {
      if (service) {
        try {
          await service.shutdown();
        } catch (cleanupError) {
          Cu.reportError(cleanupError);
        }
        try {
          serviceModule?.unregisterActiveService?.(service);
        } catch (cleanupError) {
          Cu.reportError(cleanupError);
        }
      }
      service = null;
      try {
        await ariaNgModule.stopAriaNg("ADDON_DISABLE");
      } catch (cleanupError) {
        Cu.reportError(cleanupError);
      }
      throw error;
    }
  })();
  startupPromise.catch(Cu.reportError);
  try {
    const { AsyncShutdown } = ChromeUtils.importESModule(
      "resource://gre/modules/AsyncShutdown.sys.mjs",
    );
    asyncShutdownBlocker = AsyncShutdown.profileBeforeChange.addBlocker(
      "DownloadIt: shutdown",
      () => shutdownCompletedPromise || Promise.resolve(),
    );
  } catch {}
  return startupPromise;
}

function shutdown(data, reason) {
  const appShutdown = typeof APP_SHUTDOWN !== "undefined" && reason === APP_SHUTDOWN;
  const lifecycleReason = getLifecycleReason(
    reason,
    appShutdown ? "APP_SHUTDOWN" : "ADDON_DISABLE",
  );
  const pending = startupPromise || Promise.resolve();

  shutdownCompletedPromise = pending.catch(Cu.reportError).then(async () => {
    const currentService = service;
    try {
      await currentService?.shutdown();
    } catch (error) {
      Cu.reportError(error);
    } finally {
      if (currentService) {
        const { unregisterActiveService } = ChromeUtils.importESModule(MODULE_URI);
        unregisterActiveService(currentService);
      }
      service = null;
      startupPromise = null;
    }
    const ariaNgModule = ChromeUtils.importESModule(ARIANG_MODULE_URI);
    try {
      await ariaNgModule.stopAriaNg(lifecycleReason);
    } catch (error) {
      Cu.reportError(error);
    }
    if (!appShutdown) {
      ChromeUtils.unloadESModule(MODULE_URI);
      ChromeUtils.unloadESModule(ARIANG_MODULE_URI);
    }
  }).catch(Cu.reportError);
  return shutdownCompletedPromise;
}

function uninstall(data, reason) {
  if (typeof ADDON_UNINSTALL === "undefined" || reason !== ADDON_UNINSTALL) {
    return;
  }

  if (asyncShutdownBlocker) {
    try {
      asyncShutdownBlocker.remove();
    } catch {}
    asyncShutdownBlocker = null;
  }

  try {
    const profileDirectory = Services.dirsvc.get("ProfD", Ci.nsIFile);
    profileDirectory.append(PROFILE_DIRECTORY);
    if (profileDirectory.exists()) {
      profileDirectory.remove(true);
    }
  } catch (error) {
    Cu.reportError(error);
  }
}

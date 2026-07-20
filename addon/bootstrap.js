/* exported install uninstall startup shutdown */
"use strict";

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

const Services = globalThis.Services || ChromeUtils.importESModule(
  "resource://gre/modules/Services.sys.mjs"
).Services;

const MODULE_URI = "chrome://downloadit/content/DownloadItService.sys.mjs";
const PROFILE_DIRECTORY = "DownloadIt";

let service = null;
let startupPromise = null;

function install() {}

function startup(data) {
  startupPromise = (async () => {
    const {
      DownloadItService,
      registerActiveService,
      unregisterActiveService,
    } = ChromeUtils.importESModule(MODULE_URI);
    service = new DownloadItService(data);
    registerActiveService(service);
    try {
      await service.startup();
    } catch (error) {
      unregisterActiveService(service);
      service = null;
      throw error;
    }
  })();
  startupPromise.catch(Cu.reportError);
  return startupPromise;
}

function shutdown(data, reason) {
  const appShutdown = typeof APP_SHUTDOWN !== "undefined" && reason === APP_SHUTDOWN;
  const pending = startupPromise || Promise.resolve();

  pending.catch(Cu.reportError).then(async () => {
    const currentService = service;
    await currentService?.shutdown();
    if (currentService) {
      const { unregisterActiveService } = ChromeUtils.importESModule(MODULE_URI);
      unregisterActiveService(currentService);
    }
    service = null;
    startupPromise = null;
    if (!appShutdown) {
      ChromeUtils.unloadESModule(MODULE_URI);
    }
  }).catch(Cu.reportError);
}

function uninstall(data, reason) {
  if (typeof ADDON_UNINSTALL === "undefined" || reason !== ADDON_UNINSTALL) {
    return;
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

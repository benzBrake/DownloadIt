/* exported install uninstall startup shutdown */
"use strict";

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

const Services = globalThis.Services || ChromeUtils.importESModule(
  "resource://gre/modules/Services.sys.mjs"
).Services;

const MODULE_URI = "chrome://downloadit/content/DownloadItService.sys.mjs";
const ARIANG_MODULE_URI = "chrome://downloadit/content/DownloadItAriaNg.sys.mjs";
const LOCALIZATION_MODULE_URI =
  "chrome://downloadit/content/DownloadItLocalization.sys.mjs";
const PROFILE_DIRECTORY = "DownloadIt";
const PROFILE_DATA_PREF = "downloadit.keepProfileDataOnUninstall";
const MANAGED_BINARY_NAMES = ["FlashGot.exe", "aria2-next.exe", "aria2-next"];
const RESTART_TITLE_L10N_ID = "downloadit-restart-required-title";
const INSTALL_RESTART_MESSAGE_L10N_ID = "downloadit-restart-after-install";
const UPGRADE_RESTART_MESSAGE_L10N_ID = "downloadit-restart-after-upgrade";

let service = null;
let startupPromise = null;
let asyncShutdownBlocker = null;
let shutdownCompletedPromise = null;

function install() {}

function shouldPromptForRestart(lifecycleReason) {
  return lifecycleReason === "ADDON_INSTALL" || lifecycleReason === "ADDON_UPGRADE";
}

async function promptForRestart(lifecycleReason) {
  const browserWindow = Services.wm?.getMostRecentWindow?.("navigator:browser");
  if (!browserWindow || browserWindow.closed) {
    return;
  }

  const { initializeDownloadItLocalization } = ChromeUtils.importESModule(
    LOCALIZATION_MODULE_URI,
  );
  await initializeDownloadItLocalization(browserWindow);
  const l10n = browserWindow.document?.l10n;
  if (typeof l10n?.formatValue !== "function") {
    return;
  }
  const title = await l10n.formatValue(RESTART_TITLE_L10N_ID);
  const message = await l10n.formatValue(
    lifecycleReason === "ADDON_UPGRADE"
      ? UPGRADE_RESTART_MESSAGE_L10N_ID
      : INSTALL_RESTART_MESSAGE_L10N_ID,
  );
  if (!Services.prompt.confirm(browserWindow, title, message)) {
    return;
  }
  Services.startup.quit(
    Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart,
  );
}

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
    const lifecycleReason = getLifecycleReason(reason, "APP_STARTUP");
    try {
      ariaNgModule = ChromeUtils.importESModule(ARIANG_MODULE_URI);
      serviceModule = ChromeUtils.importESModule(MODULE_URI);
      await ariaNgModule.startAriaNg(
        data,
        lifecycleReason,
      );
      const {
        DownloadItService,
        registerActiveService,
        unregisterActiveService,
      } = serviceModule;
      service = new DownloadItService(data);
      registerActiveService(service);
      await service.startup();
      if (shouldPromptForRestart(lifecycleReason)) {
        try {
          await promptForRestart(lifecycleReason);
        } catch (error) {
          Cu.reportError(error);
        }
      }
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

  const cleanup = async () => {
    // Ensure managed child processes release profile binaries before removal.
    await shutdown(data, reason);
    try {
      const profileDirectory = Services.dirsvc.get("ProfD", Ci.nsIFile);
      profileDirectory.append(PROFILE_DIRECTORY);
      if (!profileDirectory.exists()) {
        return;
      }
      for (const name of MANAGED_BINARY_NAMES) {
        const binary = profileDirectory.clone();
        binary.append(name);
        if (binary.exists()) {
          try {
            binary.remove(false);
          } catch (error) {
            Cu.reportError(error);
          }
        }
      }
      const keepProfileData = Services.prefs?.getBoolPref?.(
        PROFILE_DATA_PREF,
        true,
      ) ?? true;
      if (!keepProfileData && profileDirectory.exists()) {
        try {
          profileDirectory.remove(true);
        } catch (error) {
          Cu.reportError(error);
        }
      }
    } catch (error) {
      Cu.reportError(error);
    }
  };
  const cleanupPromise = cleanup();
  cleanupPromise.catch(Cu.reportError);
  return cleanupPromise;
}

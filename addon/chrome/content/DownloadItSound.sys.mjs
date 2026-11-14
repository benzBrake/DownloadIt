export const DOWNLOAD_SOUND_PREF = "downloadit.downloadSound";
export const BUILTIN_DOWNLOAD_SOUND =
  "chrome://downloadit/content/sounds/download-complete.wav";

export function normalizeDownloadSoundSettings(value = {}) {
  return {
    enabled: value?.enabled === true,
    volume: Number.isInteger(value?.volume) && value.volume >= 0 && value.volume <= 100
      ? value.volume : 70,
    path: typeof value?.path === "string" ? value.path.trim() : "",
  };
}

export function validateDownloadSoundSettings(value) {
  if (!value || typeof value.enabled !== "boolean" ||
      !Number.isInteger(value.volume) || value.volume < 0 || value.volume > 100 ||
      typeof value.path !== "string" || /[\r\n\0]/.test(value.path)) {
    throw Object.assign(new Error("Invalid download sound settings"), {
      code: "download-sound-settings-invalid",
    });
  }
  return normalizeDownloadSoundSettings(value);
}

// One service-wide view avoids duplicate sounds when several browser windows exist.
export class DownloadItSoundIntegration {
  constructor({ downloads, readSettings, resolveURL, createAudio, reportError = console.error }) {
    Object.assign(this, { downloads, readSettings, resolveURL, createAudio, reportError });
    this.registration = null;
    this.playback = null;
    this.known = new WeakSet();
    this.completed = new WeakSet();
  }

  start() {
    if (this.registration) {
      return this.registration.ready;
    }
    this.known = new WeakSet();
    this.completed = new WeakSet();
    const registration = { list: null, view: null, ready: null };
    registration.view = {
      onDownloadAdded: download => {
        if (this.registration !== registration) return;
        this.known.add(download);
        // addView replays the existing list: never announce historical successes.
        if (download.succeeded) this.completed.add(download);
      },
      onDownloadChanged: download => {
        if (this.registration !== registration || !this.known.has(download) ||
            this.completed.has(download) || !download.succeeded || !download.stopped ||
            download.canceled || download.error) return;
        this.completed.add(download);
        const settings = this.readSettings();
        if (settings.enabled) {
          this.play(settings, { replace: false }).catch(this.reportError);
        }
      },
      onDownloadRemoved: download => {
        if (this.registration !== registration) return;
        this.known.delete(download);
        this.completed.delete(download);
      },
    };
    this.registration = registration;
    registration.ready = (async () => {
      const list = await this.downloads.getList(this.downloads.ALL);
      if (this.registration !== registration) return;
      registration.list = list;
      await list.addView(registration.view);
    })();
    return registration.ready;
  }

  async stop() {
    const registration = this.registration;
    this.registration = null;
    this.stopAudio();
    if (!registration) return;
    try {
      await registration.ready;
    } finally {
      if (registration.list) {
        await registration.list.removeView(registration.view);
      }
    }
  }

  stopAudio() {
    this.playback?.dispose();
  }

  async play(value, { replace = true } = {}) {
    const settings = validateDownloadSoundSettings(value);
    // Coalesce simultaneous completions rather than layering identical chimes.
    if (!replace && this.playback) return false;
    this.stopAudio();
    const url = settings.path ? this.resolveURL(settings.path) : BUILTIN_DOWNLOAD_SOUND;
    const audio = this.createAudio(url);
    audio.volume = settings.volume / 100;
    const owner = audio.ownerDocument?.defaultView;
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      audio.removeEventListener("ended", dispose);
      audio.removeEventListener("error", dispose);
      owner?.removeEventListener("unload", dispose);
      if (this.playback?.audio === audio) this.playback = null;
      try {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      } catch {}
    };
    this.playback = { audio, dispose };
    audio.addEventListener("ended", dispose, { once: true });
    audio.addEventListener("error", dispose, { once: true });
    owner?.addEventListener("unload", dispose, { once: true });
    try {
      await audio.play();
      return true;
    } catch (error) {
      if (disposed && error?.name === "AbortError") return false;
      dispose();
      throw Object.assign(new Error("Download sound playback failed", { cause: error }), {
        code: "download-sound-playback-failed",
        args: { error: String(error?.message || error) },
      });
    }
  }
}

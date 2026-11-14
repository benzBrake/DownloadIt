import { tokenizeArguments } from "./DownloadItDownloaders.sys.mjs";

export const YTDLP_PRESETS_PREF = "downloadit.ytDlp.presets";
export const YTDLP_PRESET_IDS = Object.freeze(["video", "audio", "subtitles", "playlist"]);

export function defaultYtDlpPresets() {
  return [
    { id: "video", name: "", args: "--no-playlist", enabled: true },
    { id: "audio", name: "", args: "--no-playlist -x --audio-format mp3", enabled: true },
    { id: "subtitles", name: "", args: '--no-playlist --skip-download --write-subs --write-auto-subs --sub-langs "all,-live_chat"', enabled: true },
    { id: "playlist", name: "", args: "--yes-playlist", enabled: true },
  ];
}

export class YtDlpPresetError extends Error {
  constructor() {
    super("Invalid yt-dlp presets");
    this.name = "YtDlpPresetError";
    this.code = "ytdlp-presets-invalid";
  }
}

export function validateYtDlpPresets(value) {
  if (!Array.isArray(value) || !value.length || value.length > 50) {
    throw new YtDlpPresetError();
  }
  const ids = new Set();
  const presets = value.map(item => {
    if (!item || typeof item !== "object" ||
        typeof item.id !== "string" || !/^[a-z][a-z0-9-]{0,79}$/.test(item.id) ||
        ids.has(item.id) || typeof item.name !== "string" ||
        item.name.length > 120 || /[\u0000-\u001f]/u.test(item.name) ||
        (!item.name.trim() && !YTDLP_PRESET_IDS.includes(item.id)) ||
        typeof item.args !== "string" || item.args.length > 8192 ||
        item.args.includes("\0") || typeof item.enabled !== "boolean") {
      throw new YtDlpPresetError();
    }
    // Parse without a shell, retaining quoted argument boundaries and paths.
    try { tokenizeArguments(item.args); } catch { throw new YtDlpPresetError(); }
    ids.add(item.id);
    return { id: item.id, name: item.name.trim(), args: item.args, enabled: item.enabled };
  });
  if (!presets.some(item => item.enabled)) throw new YtDlpPresetError();
  return presets;
}

export function readYtDlpPresets(value) {
  if (value) {
    try { return validateYtDlpPresets(JSON.parse(value)); } catch {}
  }
  return defaultYtDlpPresets();
}

export function buildYtDlpArguments(pageURL, directory, presets, presetId = null) {
  const url = new URL(pageURL);
  if (!["http:", "https:"].includes(url.protocol)) throw new YtDlpPresetError();
  const enabled = validateYtDlpPresets(presets).filter(item => item.enabled);
  const preset = presetId == null ? enabled[0] : enabled.find(item => item.id === presetId);
  if (!preset) throw new YtDlpPresetError();
  return ["--ignore-config", "--paths", directory,
    ...tokenizeArguments(preset.args), "--", String(pageURL)];
}

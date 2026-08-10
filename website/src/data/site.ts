export type Locale = "en" | "zh-CN";

export const routes = {
  home: "",
  install: "getting-started/installation/",
  quickStart: "getting-started/quick-start/",
  entryPoints: "guides/entry-points-and-links/",
  autoCapture: "guides/auto-capture/",
  integrations: "guides/download-managers/",
  customDownloaders: "guides/custom-downloaders/",
  mirrors: "guides/mirrors/",
  settings: "reference/settings/",
  compatibility: "reference/compatibility/",
  privacy: "reference/privacy/",
  troubleshooting: "troubleshooting/",
  faq: "faq/",
} as const;

export type RouteName = keyof typeof routes;

export function pagePath(route: RouteName, locale: Locale): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const localePrefix = locale === "zh-CN" ? "zh-CN/" : "";
  return `${base}${localePrefix}${routes[route]}`;
}

export function currentLocale(lang: string): Locale {
  return lang.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

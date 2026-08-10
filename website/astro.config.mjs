import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

const siteUrl = "https://benzbrake.github.io";
const basePath = "/DownloadIt";
const socialImage = `${siteUrl}${basePath}/social-card.png`;

export default defineConfig({
  site: siteUrl,
  base: basePath,
  i18n: {
    defaultLocale: "en",
    locales: ["en", { codes: ["zh-CN"], path: "zh-CN" }],
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },
  output: "static",
  trailingSlash: "always",
  integrations: [
    starlight({
      title: "DownloadIt",
      description:
        "Route Firefox downloads to the download manager you already use.",
      logo: {
        src: "./src/assets/downloadit.svg",
        alt: "DownloadIt",
      },
      favicon: "/favicon.svg",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/benzBrake/DownloadIt",
        },
      ],
      sidebar: [
        {
          label: "Get started",
          translations: { "zh-CN": "开始使用" },
          items: [{ autogenerate: { directory: "getting-started" } }],
        },
        {
          label: "Guides",
          translations: { "zh-CN": "使用指南" },
          items: [{ autogenerate: { directory: "guides" } }],
        },
        {
          label: "Reference",
          translations: { "zh-CN": "参考" },
          items: [{ autogenerate: { directory: "reference" } }],
        },
        {
          label: "Help",
          translations: { "zh-CN": "帮助" },
          items: ["troubleshooting", "faq"],
        },
      ],
      components: {
        Hero: "./src/components/Hero.astro",
        Footer: "./src/components/Footer.astro",
      },
      customCss: [
        "@fontsource/fira-sans/400.css",
        "@fontsource/fira-sans/500.css",
        "@fontsource/fira-sans/600.css",
        "@fontsource/fira-sans/700.css",
        "@fontsource/fira-mono/400.css",
        "@fontsource/noto-sans-sc/400.css",
        "@fontsource/noto-sans-sc/500.css",
        "@fontsource/noto-sans-sc/700.css",
        "./src/styles/custom.css",
      ],
      head: [
        {
          tag: "meta",
          attrs: { name: "theme-color", content: "#168ac5" },
        },
        {
          tag: "meta",
          attrs: { property: "og:image", content: socialImage },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:image:width",
            content: "1200",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:image:height",
            content: "630",
          },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:image", content: socialImage },
        },
      ],
      credits: false,
      disable404Route: true,
      lastUpdated: false,
      pagination: true,
    }),
  ],
});

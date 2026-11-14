import type { Locale } from "./site";

// Screenshot filenames are shared; history and sound demos are localized SVG. See website/SCREENSHOTS.md.
const scenes = {
  "managers-overview": ["默认下载工具、已配置的集成和可用状态", "Default downloader, configured integrations, and availability"],
  "download-dialog-save-to": ["下载确认弹窗与展开的“保存到”位置菜单", "Download confirmation with the Save To locations menu expanded"],
  "filename-encoding": ["文件名编码选择与修正后的示例文件名", "Filename encoding choices and a corrected example filename"],
  "download-dialog-settings": ["下载弹窗的快捷操作与保存位置设置", "Download dialog actions and saved folder settings"],
  "ytdlp-menu": ["视频页面上的 yt-dlp 浮动按钮与四种默认菜单", "The yt-dlp floating button and four default menu actions on a video page"],
  "ytdlp-settings": ["专用下载器中的 yt-dlp 路径设置与浮动按钮菜单入口", "The yt-dlp executable setting and Floating Button Menu section in Specialized Downloaders"],
  "batch-links": ["批量链接窗口中的图片筛选、链接列表和下载工具", "Image filtering, link results, and downloader selection in the batch links window"],
  "download-history": ["交互演示：分别播放 Firefox 下载历史中的删除失败记录与删除失效记录操作", "Interactive demos: remove failed or unavailable records from Firefox download history"],
  "download-history-settings": ["有声操作演示：点击播放，开启提示音并下载文档，完成后播放一次内置提示音", "Sound demo: click to enable the completion sound and download a document, then hear the built-in chime once"],
} as const;

export type ScreenshotId = keyof typeof scenes;

export function screenshotDescription(id: ScreenshotId, locale: Locale): string {
  return scenes[id][locale === "zh-CN" ? 0 : 1];
}

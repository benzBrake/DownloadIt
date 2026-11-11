# DownloadIt

<img src="addon/chrome/content/icons/downloadit.svg" alt="DownloadIt 图标" width="128">

[![Nightly build](https://img.shields.io/badge/nightly-download-blue?logo=firefox)](https://github.com/benzBrake/DownloadIt/releases/download/nightly/addon.xpi)

[English](README.md) · [使用文档](https://benzbrake.github.io/DownloadIt/zh-CN/)

DownloadIt 是面向现代 Firefox 的下载增强扩展，将下载器集成、批量链接工具和灵活的下载处理融入浏览器。

项目以 FlashGot 的部分下载集成功能为基础，并逐步引入 DownloadPlus（`downloadPlus_Fx136.uc.js`）中的下载弹窗、保存操作和下载历史增强。

## 现有功能

- 从右键菜单或 Firefox 原生下载弹窗将链接交给外部下载器，也可使用 Firefox 自身的下载器。
- 收集、筛选、复制和批量下载页面或选区中的链接；所选下载器支持时，也可处理 magnet 和 ed2k 链接。
- 提供内建下载器集成、随包提供的 Aria2Next 与 AriaNg，以及自定义命令和 aria2 JSON-RPC 接入。
- 可控制按文件类型自动接管和 Cookie 转发，并可选用 GitHub 镜像与 IDM 本地协议兼容功能。

界面支持英语、日语、简体中文和繁体中文。

## 后续方向

逐步移植 DownloadPlus 的下载弹窗、保存操作和下载历史增强。这些属于后续移植方向，不代表已经支持 DownloadPlus 的全部功能。DownloadIt 也仅实现了 FlashGot 的部分功能，目前不支持媒体嗅探。

## 运行环境与下载

支持 Windows 和 Linux 上的 Firefox 136 及以上版本。DownloadIt 以 bootstrapped XPI 形式加载，需要定制版 [userChrome.js Loader](https://github.com/benzBrake/userChrome.js-Loader)，或在 Firefox Developer Edition、Nightly 上使用 [Bootstrap Loader](https://github.com/benzBrake/BootstrapLoader/)。它不能作为普通 WebExtension 独立运行。

包内 Aria2Next 支持 Windows 和 Linux x86_64；基于 FlashGot 的下载器发现仅适用于 Windows。目前不支持 macOS 及 Snap、Flatpak 版 Firefox。

[下载 Nightly XPI](https://github.com/benzBrake/DownloadIt/releases/download/nightly/addon.xpi) · [使用文档](https://benzbrake.github.io/DownloadIt/zh-CN/) · [开发说明](docs/development-zh_CN.md)

## 致谢与许可证

原 FlashGot 由 Giorgio Maone 创作，采用 GPL-2.0-or-later。DownloadPlus 是后续下载体验增强的移植来源。随包组件包括 Grabby-FlashGot（GPL-3.0）、Aria2Next（GPL-2.0）和 AriaNg（MIT），详见[第三方声明](addon/THIRD_PARTY_NOTICES.txt)。

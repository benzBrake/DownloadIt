# DownloadIt

<img src="addon/chrome/content/icons/downloadit.svg" alt="DownloadIt 图标" width="128">

[![Nightly build](https://img.shields.io/badge/nightly-download-blue?logo=firefox)](https://github.com/benzBrake/DownloadIt/releases/download/nightly/addon.xpi)

[English](README.md) · [使用文档](https://benzbrake.github.io/DownloadIt/zh-CN/)

DownloadIt 是面向现代 Firefox 的下载增强扩展，将下载器集成、批量链接工具和灵活的下载处理融入浏览器。

项目以 FlashGot 的部分下载集成功能为基础，并提供下载弹窗、保存操作和下载历史增强。

## 现有功能

- **下载器集成**：从右键菜单或下载弹窗调用外部下载器，支持内建下载器、自定义命令和 aria2 JSON-RPC，随包提供 Aria2Next 与 AriaNg。
- **保存到**：在下载弹窗中快速选择常用保存位置，支持桌面、文档、图片、下载等内置文件夹，也可添加自定义文件夹。Windows 上还可开启自动列出尚未被已配置位置覆盖的盘符根目录。
- **下载弹窗增强**：编辑文件名、复制来源链接，并可选择另存为或保存并打开。
- **文件名编码修正**：自动检测 URL 文件名编码，也可手动选择或添加编码，修正乱码文件名。
- **批量下载**：收集、筛选、复制和批量下载页面或选区中的链接；下载器支持时，也可处理 magnet 和 ed2k 链接。
- **下载接管与兼容**：按文件类型自动接管下载，可配置 Cookie 转发、GitHub 镜像和 IDM 本地协议兼容。
- **多语言界面**：支持英语、日语、简体中文和繁体中文。

“下载历史”设置页默认开启清理按钮，在 Firefox“我的足迹 → 下载”中提供“删除失败记录”和“删除失效记录”。后者会先检查文件是否仍存在，只清理文件已移动或删除的成功下载记录。两项操作仅删除历史记录，不删除实际文件；关闭开关并应用后，已打开页面中的按钮也会移除。

“**请求信息传递**”区域统一展示 Cookie 转发的全局开关，以及 Referer 和 User-Agent 的“**自动附带**”只读状态。

## 运行环境与下载

支持 Windows 和 Linux 上的 Firefox 136 及以上版本。DownloadIt 以 bootstrapped XPI 形式加载，需要定制版 [userChrome.js Loader](https://github.com/benzBrake/userChrome.js-Loader)，或在 Firefox Developer Edition、Nightly 上使用 [Bootstrap Loader](https://github.com/benzBrake/BootstrapLoader/)。它不能作为普通 WebExtension 独立运行。

包内 Aria2Next 支持 Windows 和 Linux x86_64；基于 FlashGot 的下载器发现仅适用于 Windows。目前不支持 macOS 及 Snap、Flatpak 版 Firefox。

[下载 Nightly XPI](https://github.com/benzBrake/DownloadIt/releases/download/nightly/addon.xpi) · [使用文档](https://benzbrake.github.io/DownloadIt/zh-CN/) · [路线图](docs/roadmap-zh_CN.md) · [开发说明](docs/development-zh_CN.md)

手动验证下载和文件名编码可使用[本地 WSLC 下载测试服务器](docs/development-zh_CN.md#本地下载测试服务器)。

## 致谢与许可证

原 FlashGot 由 Giorgio Maone 创作，采用 GPL-2.0-or-later。随包组件包括 Grabby-FlashGot（GPL-3.0）、Aria2Next（GPL-2.0）和 AriaNg（MIT），详见[第三方声明](addon/THIRD_PARTY_NOTICES.txt)。

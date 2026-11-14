# DownloadIt

<img src="addon/chrome/content/icons/downloadit.svg" alt="DownloadIt 图标" width="128">

[![Nightly build](https://img.shields.io/badge/nightly-download-blue?logo=firefox)](https://github.com/benzBrake/DownloadIt/releases/download/nightly/addon.xpi)

[English](README.md) · [使用文档](https://benzbrake.github.io/DownloadIt/zh-CN/)

DownloadIt 是面向现代 Firefox 的下载增强扩展，将下载器集成、批量链接工具和灵活的下载处理融入浏览器。

项目以 FlashGot 的部分下载集成功能为基础，并逐步引入 DownloadPlus（`downloadPlus_Fx136.uc.js`）中的下载弹窗和保存操作增强。

## 现有功能

- 从右键菜单或 Firefox 原生下载弹窗将链接交给外部下载器，也可使用 Firefox 自身的下载器。
- 可编辑建议文件名（同样适用于 Firefox 原生保存操作）、检测从 URL 推导的旧式编码文件名、通过随内容自适应宽度的按钮复制完整来源链接，并以文字和动画反馈复制成功或失败，并在 Firefox 下载弹窗中使用另存为、已配置的保存位置或保存并打开。
- 保存并打开同样适用于可执行文件下载，使用 Firefox 原生的下载后打开流程。
- 收集、筛选、复制和批量下载页面或选区中的链接；所选下载器支持时，也可处理 magnet 和 ed2k 链接。
- 提供内建下载器集成、随包提供的 Aria2Next 与 AriaNg，以及自定义命令和 aria2 JSON-RPC 接入。
- 可控制按文件类型自动接管和 Cookie 转发，并可选用 GitHub 镜像与 IDM 本地协议兼容功能。

界面支持英语、日语、简体中文和繁体中文。

“设置 → 下载弹窗”中的“无延时启用弹窗按钮”默认开启，将 `security.dialog_enable_delay` 设为 `0`，取消下载弹窗的按钮启用延时；其他使用该偏好的 Firefox 安全弹窗也会受到影响。关闭此选项或停用、卸载 DownloadIt 时，会恢复原用户值（原来未设置时恢复 Firefox 默认值）；若该值已在其他地方修改，则保留修改后的值。扩展不会修改已锁定的偏好。请在打开新的下载弹窗前应用设置。

“保存到”的所有位置统一在设置中管理，包括可删除的桌面、文档、图片和下载内置文件夹。“添加文件夹”旁的小箭头可快速添加内置项；内置项保存动态解析系统目录的占位符，普通项保存绝对路径。内置项可自定义显示名称，留空则使用本地化默认名称。旧设置在应用时迁移并保留自定义文件夹；删除全部位置后列表将保持为空。

图片目录读取 Windows 用户 Shell 文件夹配置或 Linux XDG 的 `user-dirs.dirs`，支持重定向位置。未配置有效且存在的图片目录时，内置项仍保留在设置中，但不会出现在下载菜单中。

文件名编码检测使用随扩展打包的 jschardet 和 Firefox 原生解码器。文件名输入框右侧的编码按钮提供自动、Firefox 文件名，以及 UTF-8、GB18030、Big5、Shift_JIS、EUC-JP、EUC-KR 和 Windows-1252。在设置的下载弹窗页面可添加最多 30 种 Firefox 支持的编码，以逗号或空格分隔。切换编码会从原始 URL 字节重新解码并替换输入框内容（包括手动编辑）。服务器提供的文件名优先。短文件名仍可能存在歧义；关闭自动检测后也可手动选择编码。

“其他文件名编码”按钮位于“检测 URL 文件名编码”右侧，关闭检测时不可点击。弹窗支持输入多个编码后点击“添加”或按 Enter，编码以可逐项移除的标签横向排列，空间不足时自动换行，并可按英语、中文、印地语、西班牙语、阿拉伯语、法语、孟加拉语、葡萄牙语、俄语和印尼语快速添加。点击“完成”后再在设置页应用；取消或按 Escape 会放弃弹窗内的修改。

## 后续方向

DownloadPlus 风格的下载历史增强仍属后续计划。DownloadIt 只实现了部分下载弹窗和保存操作，并不支持 DownloadPlus 的全部功能。DownloadIt 也仅实现了 FlashGot 的部分功能，目前不支持媒体嗅探。

## 运行环境与下载

支持 Windows 和 Linux 上的 Firefox 136 及以上版本。DownloadIt 以 bootstrapped XPI 形式加载，需要定制版 [userChrome.js Loader](https://github.com/benzBrake/userChrome.js-Loader)，或在 Firefox Developer Edition、Nightly 上使用 [Bootstrap Loader](https://github.com/benzBrake/BootstrapLoader/)。它不能作为普通 WebExtension 独立运行。

包内 Aria2Next 支持 Windows 和 Linux x86_64；基于 FlashGot 的下载器发现仅适用于 Windows。目前不支持 macOS 及 Snap、Flatpak 版 Firefox。

[下载 Nightly XPI](https://github.com/benzBrake/DownloadIt/releases/download/nightly/addon.xpi) · [使用文档](https://benzbrake.github.io/DownloadIt/zh-CN/) · [开发说明](docs/development-zh_CN.md)

手动验证下载和文件名编码可使用[本地 WSLC 下载测试服务器](docs/development-zh_CN.md#本地下载测试服务器)。

## 致谢与许可证

原 FlashGot 由 Giorgio Maone 创作，采用 GPL-2.0-or-later。DownloadPlus 是后续下载体验增强的移植来源。随包组件包括 Grabby-FlashGot（GPL-3.0）、Aria2Next（GPL-2.0）和 AriaNg（MIT），详见[第三方声明](addon/THIRD_PARTY_NOTICES.txt)。

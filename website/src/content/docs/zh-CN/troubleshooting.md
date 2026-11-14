---
title: 故障排查
description: 排查安装、启动、工具栏按钮缺失、下载工具不可用、Linux 启动失败和配置损坏问题。
sidebar:
  order: 1
---

## DownloadIt 没有启动

1. 确认 Firefox 满足[平台兼容性](../reference/compatibility/)中的最低版本。
2. 确认所选 Loader 已安装在当前打开的 Firefox 程序和同一个 profile 中。Firefox Developer Edition 和 Nightly 可以使用 [`Bootstrap Loader`](https://github.com/benzBrake/BootstrapLoader/) 替代定制 `userChrome.js-Loader`。
3. 在 `about:addons` 检查 DownloadIt 是否启用。
4. 安装或升级后重启 Firefox。
5. 使用多个 profile 时，打开 `about:support` 核对当前 profile 目录。

## 工具栏按钮消失

打开 Firefox 的**定制工具栏**界面查找 DownloadIt。新安装会把按钮加入导航栏，但 Firefox 会保留之后的工具栏自定义。

## 下载工具不可用

- 打开工具栏面板，选择**刷新下载工具**。
- 对 JDownloader、AB Download Manager 或 XDM，核对回环端点并执行明确的连接测试。
- 核对手动启动器路径。无效的手动路径不会回退到旧检测路径。
- 对 uGet 和命令行工具，确认所选可执行文件属于当前操作系统。
- 对 Aria2Next，确认平台和架构受支持，且 RPC 探测成功。

## 任务被拒绝

将任务要求与所选路径的能力标签对照。常见原因包括向不支持的 provider 发送 POST 数据、协议不受支持、批次包含混合 POST 正文，或目标是受保护的 XPI。

普通 HTTP/HTTPS 下载可以尝试 Firefox 内建 provider；它保留 Firefox 请求上下文，也没有外部进程的能力限制。

## Linux 启动器失败

使用发行版原生 Firefox 包或 Mozilla tarball。确认启动器存在且具有可执行权限，例如执行 `chmod +x /path/to/launcher`。Snap 和 Flatpak 的进程边界不受支持。

## 无法保存设置

Firefox 策略可能锁定偏好，设置页会显示该状态。自定义下载工具或规则 JSON 无效时，DownloadIt 会保留文件并禁止不安全覆盖。外部修正后使用重试，或在确认可以丢弃损坏配置时执行显式重置。

## 视频下载按钮不出现

在**专用下载器**中检查 yt-dlp 路径，点击**应用**，并确认至少启用一项菜单。Linux 上检查可执行权限。按钮只在 yt-dlp 检测到支持的页面格式后出现；检测失败、网站不支持或页面需要额外认证时可能不显示。配置路径不代表所有页面都可下载，详见 [yt-dlp 指南](../guides/yt-dlp/)。

## 文件名仍然乱码

确认**检测 URL 文件名编码**已开启并应用。传统编码可能存在歧义，在下载弹窗中切换候选编码或手动编辑名称；缺少的编码可在**其他文件名编码**中添加。下载内容的编码不决定 URL 文件名编码，详见[下载弹窗与保存](../guides/download-dialog/)。

## 没有下载完成提示音

提示音默认关闭。先在**下载历史**中启用、设置非零音量并点击**应用**，再用**试听**检查系统音量和音频文件。可改用内置提示音排除自定义文件问题。它只监听 Firefox 管理的新完成下载，不监听外部下载器或 yt-dlp，也不会为已有完成记录补播，详见[下载历史与提示音](../guides/download-history/)。

其他问题可以搜索 [GitHub issues](https://github.com/benzBrake/DownloadIt/issues)。报告时请提供 Firefox 版本、操作系统、DownloadIt 版本、使用入口和所选 provider，但不要发布密钥、私人路径或 Cookie 数据。

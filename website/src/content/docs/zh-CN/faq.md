---
title: 常见问题
description: 回答为什么需要 Loader、AMO 安装、Nightly 发布、升级、系统支持、外部下载工具、Cookie 和 FlashGot 等问题。
sidebar:
  order: 2
  label: 常见问题
---

## 为什么 DownloadIt 需要定制 Loader？

DownloadIt 使用 Firefox 内部 API 和 legacy bootstrapped-XPI 生命周期，集成浏览器 chrome、下载提示、进程和特权请求上下文。普通 WebExtension 无法提供相同的集成范围。

## 可以从 Mozilla Add-ons 安装吗？

不可以。DownloadIt 不是 AMO WebExtension。请先安装定制 `userChrome.js-Loader`，再从 `about:addons` 选择本地 XPI 安装。

## 有稳定版吗？

目前没有。官网链接指向从 `master` 构建的 Nightly 预发布版本；下载按钮和安装页都会明确标注预发布状态。

## DownloadIt 会自动更新吗？

不会。DownloadIt 会发布 legacy 更新清单，但当前 Loader 不会检查或安装。请下载新版 XPI 覆盖安装，并在提示后重启 Firefox。

## 支持哪些系统？

支持 Windows 和非沙箱 Linux Firefox。Linux 包内 Aria2Next 需要 x86_64。macOS、Snap Firefox 和 Flatpak Firefox 不在当前支持范围内。

## 必须安装外部下载工具吗？

不需要。Firefox 内建下载器始终可用。外部工具可以根据集成路径增加协议、队列、自动化或命令行能力。

## DownloadIt 会完全替代 FlashGot 吗？

DownloadIt 将部分 FlashGot 下载桥接行为移植到当前 Firefox。Windows 上可以使用包内 FlashGot helper 检测兼容工具，但 DownloadIt 拥有独立版本线、设置、原生 provider、本地协议集成和自定义下载工具系统，尚未实现 FlashGot 的全部历史功能。

## 可以发送登录 Cookie 吗？

启用**发送 Cookie**后，DownloadIt 可以把 Cookie 数据交给支持的外部路径；Firefox provider 则使用 Firefox 原生 cookie jar。除非外部工具确实需要认证上下文，否则建议关闭转发。

## 支持抓取流媒体吗？

不支持。DownloadIt Links 收集显式页面链接，不实现网络媒体嗅探或媒体元素资源发现。

## 在哪里报告问题？

请使用 [GitHub issues](https://github.com/benzBrake/DownloadIt/issues)。提供可复现步骤和环境版本，但移除私人 URL、文件系统路径、RPC 密钥和 Cookie 数据。

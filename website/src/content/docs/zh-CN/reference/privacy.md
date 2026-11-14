---
title: 请求与隐私
description: 了解 Cookie 转发、自动附带的 Referer 和 User-Agent、外部工具、镜像和本地配置存储。
sidebar:
  order: 3
---

DownloadIt 在本地工作，不需要账号，也没有用于上传下载历史的扩展服务。提交任务仍会联系下载目标，以及你选择的外部下载器、RPC 服务或镜像。

<span id="request-forwarding"></span>

## 请求信息传递

在**请求与隐私 → 请求信息传递**中，**向下载工具发送 Cookies**是 Cookie 全局开关。如果外部工具不需要认证信息，可以关闭它。工具只会接收集成路径支持的信息，开启开关不代表所有下载器都能处理登录后的下载。

Referer 与 User-Agent 显示**自动附带**只读状态，适用的集成会自动传递；目前没有分别控制它们的全局开关。特定站点覆盖、自定义站点 Referer/User-Agent 和站点 Cookie 规则属于计划功能，尚未实现。

Firefox 内建下载器使用浏览器自身的请求和 Cookie 上下文。转发开关控制外部集成路径，不能替代 Firefox Cookie 设置。yt-dlp 菜单传入页面网址、下载目录和配置的参数，不会自动导出浏览器 Cookie。

## 外部服务与镜像

本地 HTTP 集成和 aria2 JSON-RPC 会向你配置的端点发送数据。自定义下载器配置中的密钥以明文保存，请勿把配置作为公开诊断附件发布。

镜像路由是默认关闭的可选功能。改写的任务不携带源站 Cookie 数据或 Cookie 文件；批次包含镜像 URL 时，也会清除页面级 Cookie 数据。镜像仍会接收文件 URL，详见[镜像加速](../../guides/mirrors/)。

yt-dlp 页面检测会针对当前页面网址运行外部执行文件，可能联系对应网站。后续下载由 yt-dlp 管理，而不是 Firefox。

## 本地数据与诊断

偏好和自定义定义存储在 Firefox profile 中，卸载设置决定是否保留 DownloadIt 配置。下载历史清理只删除记录，不删除文件；完成提示音不上传下载记录。

报告问题时移除私人 URL、个人路径、Cookie 和 RPC 密钥。截图使用示例数据，分享前检查画面。

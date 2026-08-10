---
title: 自动接管
description: 通过扩展名白名单、黑名单和不可覆盖的安全规则，决定 DownloadIt 可以接管哪些 Firefox 已记住的下载。
sidebar:
  order: 2
  label: 自动接管
---

自动接管作用于 Firefox 原本会按已记住的文件类型操作处理的下载，不会把所有网络响应都变成 DownloadIt 任务。

## 规则优先级

DownloadIt 按以下顺序判断：

1. 内建目标和安全限制。
2. 内建及用户黑名单。
3. 用户白名单。
4. 没有匹配规则时保留 Firefox 原生流程。

扩展名填写时不带开头的点。规则保存在 Firefox profile 的 DownloadIt 数据目录中，并使用稳定标识，以便以后增加匹配器类型而不移动文件。

## 可以转交的目标

HTTP、HTTPS、FTP、`magnet:` 和 `ed2k:` 目标可以使用支持的外部 provider。`magnet:` 和 `ed2k:` 还可以不依赖扩展名白名单，直接使用各自的协议默认工具。

`blob:` 和 `data:` 资源属于创建它们的浏览器上下文，始终留在 Firefox。未知协议和空扩展名同样保持原生处理。

## 内建保护

`.xpi` 是不可编辑的黑名单条目。DownloadIt 还会拒绝解码路径明确指向 XPI 或 `xpinstall` 路由的 HTTP/HTTPS 目标。URL 含糊时会结合建议文件名和 MIME 元数据判断。

这些限制应用于所有 DownloadIt 入口，用户规则无法覆盖。主机名、查询参数、fragment、Referer 或来源页 URL 中的普通 `xpinstall` 文本不会单独触发路径规则。

## 默认工具是 Firefox 时

选择 Firefox 内建 provider 后，DownloadIt 会保留现有 launcher，不会再次请求同一地址，从而避免签名 URL、一次性 URL 和 POST 下载发生重复网络请求。

相关控件见[设置参考](../../reference/settings/#自动接管)。

---
title: 镜像加速
description: 启用实验性的 GitHub 镜像适配器、验证安全端点，并了解改写、Cookie 和失败处理行为。
sidebar:
  order: 5
  label: 镜像加速
---

镜像加速是默认关闭的实验功能。它会在任务发送给 provider 前改写识别到的文件 URL，不代理浏览器页面，也不执行从 profile 加载的适配器代码。

## GitHub 适配器

内建适配器识别 Release 资产、归档、`zipball`、`tarball`、仓库 `raw` 路由、`codeload.github.com` 和 `raw.githubusercontent.com` 等 HTTPS 文件地址。

普通 GitHub 页面、API URL 和临时 `objects.githubusercontent.com` URL 不会被猜测或改写。Firefox 保留匹配的原始 channel URL 时，会优先使用它，而不是已重定向的对象地址。

## 端点要求

端点会添加在原始绝对 URL 前。公共端点必须：

- 使用 HTTPS；
- 不包含用户名或密码；
- 不包含查询参数或 fragment。

只有回环地址允许使用 HTTP。DownloadIt 会校验端点格式，但不会执行健康检查。

## 隐私与失败

改写后的链接不会携带源站 Cookie 数据或 Cookie 文件。批次中只要包含一个镜像链接，也会清除页面级 Cookie 数据。

POST 任务永不改写。外部下载工具接受镜像任务后，如果镜像失败，DownloadIt 不会自动重试原地址。

请只使用你信任的端点。默认值仅为方便配置，不代表服务可用性保证。

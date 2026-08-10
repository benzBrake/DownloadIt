---
title: 下载工具集成
description: 了解 Firefox 内建 provider、本地协议、Windows FlashGot bridge、能力标签以及连接测试的行为。
sidebar:
  order: 3
  label: 下载工具
---

DownloadIt 通过统一的下载工具列表展示所有可用路径。任务可以由 Firefox 自身、内建本地协议、原生可执行文件、Windows FlashGot bridge 或自定义定义处理。

## 内含路径

| 集成 | Windows | Linux | 连接方式 |
| --- | --- | --- | --- |
| Firefox 原生下载 | 支持 | 支持 | Firefox Downloads API |
| JDownloader | 支持 | 支持 | 本地 FlashGot 兼容 HTTP 端点 |
| AB Download Manager | 支持 | 支持 | 本地 HTTP API |
| Xtreme Download Manager | 支持 | 支持 | 本地 HTTP API |
| uGet | 支持 | 支持 | 静默命令行接口 |
| 包内 Aria2Next | 支持 | x86_64 | 本地进程与 JSON-RPC |
| 自定义命令或 aria2 | 支持 | 支持 | 原生进程或 JSON-RPC |
| FlashGot 检测工具 | 支持 | 不使用 | 包内 Windows helper |

Firefox provider 始终可用，外部下载工具不是必需项。

## 添加或配置工具

打开**下载工具**并选择**添加下载工具**。内建协议集成是单例：再次配置 JDownloader、AB Download Manager、XDM、uGet 或 Aria2Next 会打开现有条目。移除条目会禁用该集成并清理由 DownloadIt 管理的设置。

FlashGot 检测到的工具不出现在此目录中，因为 DownloadIt 没有需要编辑的本地定义。

## 能力标签

每条活动路径会报告能否接收：

- POST 请求正文；
- Cookie 数据；
- 批量提交；
- 调用方指定的下载目录；
- 请求的任务启动状态；
- `magnet:` 和 `ed2k:` URL。

`+` 表示支持，`-` 表示不支持，`?` 表示集成尚未确定能力。标签描述 DownloadIt 的传递路径，不代表外部程序的全部功能。

## 可用状态与测试

已配置的本地 HTTP 集成会在启动和刷新时于后台探测。手动连接测试使用尚未保存的编辑器值，不改变已保存 provider 的状态。本地启动器只在明确测试或提交时运行，不会因为打开设置而启动。

可执行文件模板和外部 aria2 服务详见[自定义下载器](../custom-downloaders/)。

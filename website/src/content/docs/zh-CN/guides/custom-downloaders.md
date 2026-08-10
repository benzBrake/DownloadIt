---
title: 自定义命令与 aria2
description: 使用明确的路径、模板、能力和生命周期行为配置可重复添加的命令行下载工具或 aria2 JSON-RPC 服务。
sidebar:
  order: 4
  label: 自定义命令与 aria2
---

自定义定义以格式化 JSON 保存在 Firefox profile 中。如果文件损坏或 schema 不受支持，DownloadIt 会保留原文件、禁用自定义编辑，并要求显式重置后才允许覆盖。

## 命令行下载工具

选择可执行文件并填写参数模板。DownloadIt 使用 Firefox 原生进程 API 启动，不会把可执行文件路径或任务数据插入 shell 代码。

编辑器提供 `aria2c`、`wget` 和 `curl` 快捷模板。常用 FlashGot 兼容占位符包括：

| 占位符 | 值 |
| --- | --- |
| `URL` | 当前目标 URL |
| `FNAME` | 建议文件名 |
| `REFERER` | 请求 Referer |
| `COOKIE` / `CFILE` | Cookie 值或临时 Cookie 文件 |
| `FOLDER` | 下载目录 |
| `POST` / `RAWPOST` | POST 请求数据 |
| `HEADERS` | 请求头 |
| `ULIST` / `UFILE` | 批量 URL 列表或列表文件 |
| `UA` | User-Agent |

模板包含 `ULIST` 或 `UFILE` 时，整个批次只启动一个进程；其他模板则为每个链接启动一个进程。

## 路径与可移植性

Firefox profile 的 `chrome` 目录内的可执行文件和 aria2 配置文件会以正斜杠相对路径保存，目录外文件保留绝对路径。来自另一操作系统的绝对路径会继续保存，但在当前系统显示为不可用。

Linux 启动器必须具有可执行权限。如果 Firefox 无法枚举一个实际有效的 Linux 可执行文件，DownloadIt 会使用固定的 `/bin/sh` 回退，先验证文件，再以独立参数调用 `exec`。

Windows 命令进程默认隐藏。Firefox 在 Linux 上不实现这个进程选项，因此不会显示**隐藏运行**控件。

## aria2 JSON-RPC

aria2 定义连接 HTTP 或 HTTPS JSON-RPC 端点，可以填写密钥和服务端下载目录；多链接通过 `system.multicall` 提交。

可选本地启动仅限 HTTP 回环端点。DownloadIt 可以启动 `aria2c`、传递所选配置文件、管理 RPC 地址、端口与密钥，并在短暂等待就绪后重试首次请求。

DownloadIt 只关闭由自身启动的 aria2 进程，外部管理的服务保持运行。RPC 密钥以明文保存在自定义 JSON 中，但不会写入 DownloadIt 日志。

Cookie 转发受全局设置控制，详见 [Cookie 与隐私](../../reference/privacy/)。

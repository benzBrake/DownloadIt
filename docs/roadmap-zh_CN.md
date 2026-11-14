# 路线图

[English](roadmap.md) · [项目介绍](../README-zh_CN.md)

## 项目范围

DownloadIt 专注于下载集成与下载处理，不以复刻 FlashGot 的全部功能为目标。目前不支持媒体嗅探。

## 计划工作

### 请求信息传递

请求信息传递计划采用“**全局默认值 + 特定站点规则**”。全局开关将控制是否附带 Cookies、Referer 和 User-Agent；特定站点规则可覆盖默认值、指定 Referer 或 User-Agent，或禁止传递 Cookies。

Referer、User-Agent 的全局开关和特定站点规则尚未上线。

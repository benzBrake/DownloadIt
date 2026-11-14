# Roadmap

[简体中文](roadmap-zh_CN.md) · [Project overview](../README.md)

## Scope

DownloadIt focuses on download integration and handling rather than recreating every FlashGot feature. Media sniffing is not currently supported.

## Planned work

### Request information forwarding

Request information forwarding is planned to support **global defaults + site-specific rules**. Global switches will control whether cookies, Referer, and User-Agent are attached. Site-specific rules will be able to override those defaults, specify a Referer or User-Agent, or omit cookies.

The global Referer and User-Agent switches and site-specific rules are not yet available.

# DownloadIt

[![Nightly build](https://img.shields.io/badge/nightly-download-blue?logo=firefox)](https://nightly.link/benzBrake/DownloadIt/workflows/nightly.yml/master/DownloadIt-nightly.zip)

DownloadIt 是面向现代 Firefox 的 FlashGot 下载桥接扩展移植版。它通过定制的 [`userChrome.js-Loader`](https://github.com/benzBrake/userChrome.js-Loader) 加载 bootstrapped XPI，并把网页链接交给外部下载管理器处理。

当前版本处于迁移阶段，目标平台为 Windows，Firefox 最低版本为 136.0。

## 当前功能

- 在网页链接的右键菜单中提供 DownloadIt 菜单。
- 自动检测 `FlashGot.exe` 支持的可用下载管理器，并允许选择默认工具。
- 支持 `http`、`https`、`ftp` 和 `magnet` 链接。
- 向下载工具传递 URL、文件名、Referer、Cookie 和 User-Agent。
- 在 Firefox 设置对话框中管理默认下载工具和 Cookie 转发策略。
- 界面和右键菜单支持简体中文与英文。
- 构建时校验并在运行时校验随扩展发布的 `FlashGot.exe`。

当前尚未实现：

- “全部链接”和“选择链接”下载；
- 未知文件类型拦截；
- 媒体嗅探；
- 原 FlashGot 的完整选项页及其他高级功能。

## 工作方式

```text
Firefox 右键菜单
        │
        ▼
DownloadIt 后台服务
        │  临时 JSON 文件
        ▼
FlashGot.exe
        │
        ▼
外部下载管理器
```

扩展启动时会把 XPI 中的 `FlashGot.exe` 部署到 Firefox profile 下的 `DownloadIt\FlashGot.exe`，然后使用以下命令行接口与它通信：

- `--list-json`：检测可用下载管理器；
- `--job-json`：提交单个下载任务。

## 使用前提

- Windows；
- Firefox 136.0 或更高版本；
- 已安装并正常配置的定制 `userChrome.js-Loader`。建议使用该 Loader 20250219 之后的版本（兼容 Firefox 135+）；
- 至少安装一个 `FlashGot.exe` 支持的下载管理器；
- 构建时如果缺少 `addon/FlashGot.exe`，脚本会从 [Grabby-FlashGot](https://github.com/benzBrake/Grabby-FlashGot) 的 nightly build 自动下载。该二进制组件默认被 `.gitignore` 排除，不随 Git 仓库提交；打包时会将实际文件的大小和 SHA-256 写入 XPI 内的生成元数据，并用于运行时校验；
- 开发和测试需要 Node.js 18 或更高版本；
- 构建需要 PowerShell 7（`pwsh`）。

## 构建

在仓库根目录执行：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\pack.ps1
```

脚本会把 `addon/` 打包为根目录下的 `addon.xpi`，并检查 XPI 至少包含：

- `bootstrap.js`；
- `install.rdf`；
- `chrome.manifest`；
- `FlashGot.exe`。

`addon.xpi` 是构建产物，默认被 `.gitignore` 忽略。`addon/FlashGot.exe` 也默认不纳入版本控制；缺少它时 `pack.ps1` 会自动获取最新 nightly build。

## 测试

测试使用 Node.js 内置测试运行器：

```powershell
node --test .\tests\*.test.mjs
```

测试覆盖下载任务 JSON、URL 和文件名校验、下载管理器解析、右键菜单插入点，以及设置页面的基础结构。

## 安装与升级

1. 先安装并确认 `userChrome.js-Loader` 已在目标 Firefox profile 中生效。
2. 执行构建命令生成 `addon.xpi`。
3. 在 Firefox 打开 `about:addons`，选择齿轮菜单中的“从文件安装附加组件”，选中 `addon.xpi`。
4. 重启 Firefox，使扩展和浏览器窗口中的右键菜单完成初始化。

升级时使用新构建的 `addon.xpi` 覆盖安装即可。若扩展未启动，请先确认 Loader 版本、Firefox 版本和 profile 是否匹配，再检查 `about:addons` 中的扩展状态。

## 配置

右键菜单中的“DownloadIt 设置”或 `about:addons` 中的扩展设置都可以打开设置页面。

| 偏好 | 类型 | 说明 |
| --- | --- | --- |
| `downloadit.defaultDM` | 字符串 | 默认下载管理器名称。该名称必须来自最近一次检测结果。 |
| `downloadit.omitCookies` | 布尔值 | 为 `true` 时不向外部下载工具发送 Cookie；默认值为 `false`。 |
| `downloadit.detectedManagers` | 字符串 | 下载管理器检测缓存，由扩展自动维护。 |

当偏好被 Firefox 策略锁定时，设置页面会显示锁定状态并禁止修改。

## 项目结构

```text
addon/
├── bootstrap.js                         # 扩展生命周期入口
├── install.rdf                           # bootstrapped XPI 元数据
├── chrome.manifest                       # chrome://downloadit 注册
├── FlashGot.exe                          # 下载管理器桥接程序
└── chrome/content/
    ├── DownloadItService.sys.mjs        # 服务、进程和偏好管理
    ├── DownloadItContextMenu.sys.mjs    # Firefox 右键菜单
    ├── DownloadItProtocol.sys.mjs       # 下载任务协议和校验
    ├── options.xhtml                     # 设置页面结构
    ├── options.js                        # 设置页面逻辑
    └── options.css                       # 设置页面样式
pack.ps1                                  # XPI 打包脚本
tests/                                    # Node.js 单元测试
```

## 许可证与第三方组件

DownloadIt 是基于原 FlashGot 扩展的非官方现代化移植版。原 FlashGot 由 Giorgio Maone 创作，采用 GPL-2.0-or-later，相关说明见 [`addon/THIRD_PARTY_NOTICES.txt`](addon/THIRD_PARTY_NOTICES.txt)。

打包时随附的 `FlashGot.exe` 基于 [Grabby-FlashGot](https://github.com/benzBrake/Grabby-FlashGot)，采用 GPL-3.0；每个 XPI 包含与其中二进制匹配的 `chrome/content/DownloadItBinaryMetadata.sys.mjs`，用于运行时完整性校验。

英文版本请参阅 [README.md](README.md)。

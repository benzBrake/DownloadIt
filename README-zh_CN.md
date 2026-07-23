# DownloadIt

[![Nightly build](https://img.shields.io/badge/nightly-download-blue?logo=firefox)](https://nightly.link/benzBrake/DownloadIt/workflows/nightly.yml/master/DownloadIt-nightly.zip)

DownloadIt 是面向现代 Firefox 的 FlashGot 下载桥接扩展移植版。它通过定制的 [`userChrome.js-Loader`](https://github.com/benzBrake/userChrome.js-Loader) 加载 bootstrapped XPI，并把网页链接交给外部下载管理器处理。

当前版本处于迁移阶段，目标平台为 Windows，Firefox 最低版本为 136.0。

## 当前功能

- 在网页链接的右键菜单中提供 DownloadIt 菜单。
- 在有选区且选区包含链接时，在其下方提供“使用 DownloadIt 下载选中链接”。
- 自动检测 `FlashGot.exe` 支持的可用下载管理器，并允许选择默认工具。
- 支持不经过 `FlashGot.exe` 的自定义命令行下载器和 aria2 JSON-RPC。
- 在 Firefox 原生下载弹窗中为支持的下载加入 DownloadIt 选项。
- 可以记住支持的文件扩展名，并自动交给当前默认下载工具。
- 支持 `http`、`https`、`ftp` 和 `magnet` 链接。
- 向下载工具传递 URL、文件名、Referer、Cookie 和 User-Agent。
- 在 Firefox 设置对话框中管理默认下载工具和 Cookie 转发策略。
- 在设置页面管理已记住的自动处理扩展名。
- 界面和右键菜单支持简体中文与英文。
- 使用 Firefox 内置的 Fluent 资源存储界面消息。
- 构建时校验并在运行时校验随扩展发布的 `FlashGot.exe`。

当前尚未实现：

- “全部链接”下载；
- 广泛的未知文件类型拦截；
- 媒体嗅探；
- 原 FlashGot 的完整选项页及其他高级功能。

## 工作方式

```text
Firefox 右键菜单、原生下载弹窗或已记住扩展名的 hook
        │
        ▼
DownloadIt 后台服务
        │
        ├── flashgot provider ── 临时任务 JSON ── FlashGot.exe
        ├── 自定义命令 provider ── Firefox 原生进程 API
        └── 自定义 aria2 provider ── JSON-RPC
```

扩展启动时会把 XPI 中的 `FlashGot.exe` 部署到 Firefox profile 下的 `DownloadIt\FlashGot.exe`，然后使用以下命令行接口与它通信：

- `--list-json`：检测可用下载管理器；
- `--job-json`：提交单链接或多链接下载任务。

## 使用前提

- Windows；
- Firefox 136.0 或更高版本；
- 已安装并正常配置的定制 `userChrome.js-Loader`。建议使用该 Loader 20250219 之后的版本（兼容 Firefox 135+）；
- 至少安装一个 `FlashGot.exe` 支持的下载管理器，或配置一个自定义下载器；
- 构建时如果缺少 `addon/FlashGot.exe`，PowerShell 脚本会从 [Grabby-FlashGot](https://github.com/benzBrake/Grabby-FlashGot) 的 nightly build 下载，Linux 脚本则不调用 GitHub API，而是解析最新 GitHub Release 页面并下载其中发布的 `FlashGot-v*.zip` 资产。如果上游尚无正式 Release，使用 Linux 脚本前需自行提供 `addon/FlashGot.exe`。该二进制组件默认被 `.gitignore` 排除，不随 Git 仓库提交；打包时会将实际文件的大小和 SHA-256 写入 XPI 内的生成元数据，并用于运行时校验；
- 开发和测试需要 Node.js 18 或更高版本；
- 在 Windows 上构建需要 PowerShell 7（`pwsh`）；
- 在 Linux 上构建需要 Bash、`curl`、`zip`、`unzip`、`sha256sum` 和 GNU coreutils。

## 构建

在仓库根目录执行对应平台的命令。

Windows：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\pack.ps1
```

Linux：

```bash
./pack.sh
```

脚本会把 `addon/` 打包为根目录下的 `addon.xpi`，并检查 XPI 至少包含：

- `bootstrap.js`；
- `install.rdf`；
- `chrome.manifest`；
- `FlashGot.exe`。

`addon.xpi` 是构建产物，默认被 `.gitignore` 忽略。`addon/FlashGot.exe` 也默认不纳入版本控制；缺少它时，`pack.ps1` 会获取最新 nightly build，`pack.sh` 则不调用 GitHub API，而是解析最新正式 Release 页面并下载匹配的压缩包。如果上游尚无正式 Release，请先把 `FlashGot.exe` 放入 `addon/` 再运行 `pack.sh`。

## 测试

测试使用 Node.js 内置测试运行器：

```powershell
node --test .\tests\*.test.mjs
```

测试覆盖单链接和多链接下载任务 JSON、URL 和文件名校验、选区链接提取、下载管理器解析、右键菜单插入点、已记住扩展名的自动接管与回退、原生下载弹窗集成、Fluent 资源，以及设置页面的暂存结构。

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
| `downloadit.defaultDM` | 字符串 | JSON 下载器引用，例如 `{"provider":"flashgot","id":"Internet Download Manager"}` 或 `{"provider":"custom","id":"<uuid>"}`。旧版 FlashGot 名称会自动迁移。 |
| `downloadit.omitCookies` | 布尔值 | 为 `true` 时不向外部下载工具发送 Cookie；默认值为 `false`。 |
| `downloadit.detectedManagers` | 字符串 | 下载管理器检测缓存，由扩展自动维护。 |
| `downloadit.autoExtensions` | 字符串 | 应自动发送到当前默认下载工具的文件扩展名 JSON 数组。 |

当偏好被 Firefox 策略锁定时，设置页面会显示锁定状态并禁止修改。已记住的扩展名可以在设置页面逐项移除或全部清除。

只有用户明确记住的扩展名会被自动接管。空扩展名、Firefox 安装包（`.xpi`/`xpinstall`）以及不支持的 URL 协议始终保留在 Firefox 原生流程中；`.exe` 等可执行文件扩展名可以由用户明确记住。

### 自定义下载器

自定义定义以格式化 UTF-8 JSON 保存在 Firefox profile 下的 `DownloadIt\custom-downloaders.json`。扩展启动时读取该文件，设置页也可以手动重新加载。JSON 无效或版本不受支持时会保留原文件并禁止覆盖；只有显式使用重置操作才会用空配置替换损坏文件。

首次应用自定义定义时才会创建该文件；每个条目使用稳定且不可编辑的 UUID：

```json
{
  "version": 1,
  "downloaders": [
    {
      "id": "123e4567-e89b-42d3-a456-426614174000",
      "name": "My downloader",
      "enabled": true,
      "type": "command",
      "startHidden": true,
      "command": {
        "executablePath": "C:\\Tools\\downloader.exe",
        "argumentsTemplate": "[URL]"
      }
    }
  ]
}
```

Firefox 的 chrome 配置目录（`UChrm`，通常为 `<profile>/chrome`）内的可执行文件和 aria2 配置文件会以该目录为基准，使用正斜杠保存相对路径，例如 `UserTools/aria2/aria2c.exe` 和 `UserTools/aria2/aria2.conf`。相对路径始终基于 `UChrm` 解析；目录外的文件继续保存绝对路径。

自定义下载器默认隐藏进程窗口。取消“隐藏运行”后，命令行进程或自动启动的 aria2c 进程会在前台显示，便于调试。旧 JSON 没有 `startHidden` 字段时仍按隐藏运行处理。

命令行下载器需要选择可执行文件并填写参数模板，编辑器提供 `aria2c`、`wget` 和 `curl` 快捷模板。DownloadIt 使用 Firefox 原生进程 API 直接启动程序，不会把模板交给命令 shell。支持的 FlashGot 兼容占位符包括 `URL`、`FNAME`、`COMMENT`、`REFERER`、`COOKIE`、`CFILE`、`FOLDER`、`POST`、`RAWPOST`、`HEADERS`、`ULIST`、`UFILE`、`USERPASS` 和 `UA`。模板包含 `ULIST` 或 `UFILE` 时整批只启动一个进程，否则每个链接分别启动一个进程。

aria2 定义通过 HTTP 或 HTTPS JSON-RPC 连接，支持可选密钥和服务端下载目录；多链接使用 `system.multicall` 提交。本地启动配置可选填写 `executablePath` 和 `configurationPath`：只有启用自动启动时可执行文件才是必填项，配置文件可以始终留空；填写配置文件后，DownloadIt 会把解析后的路径作为 `--conf-path` 传给 aria2c。可选的 aria2c 自动启动仅适用于 HTTP 回环地址，DownloadIt 会管理配置文件路径、RPC 开关、监听地址、端口和密钥参数，等待最多五秒后重试一次请求。RPC 密钥以明文保存在 JSON 文件中，但不会写入 DownloadIt 日志。

provider 注册表同时预留了 `native` 命名空间，供未来不经过 `FlashGot.exe`、直接使用 JavaScript 检测和调用下载器。

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
    ├── DownloadItDownloadDialog.sys.mjs # Firefox 原生下载弹窗集成
    ├── DownloadItDownloaders.sys.mjs    # provider 引用、自定义 schema、模板与 aria2 协议
    ├── DownloadItXUL.sys.mjs             # 共享的 Firefox XUL 元素构造工具
    ├── DownloadItSelectionActor.sys.mjs # 选区链接提取 Actor
    ├── DownloadItLocalization.sys.mjs   # Firefox Fluent 资源注册
    ├── DownloadItProtocol.sys.mjs       # 下载任务协议和校验
    ├── DownloadItUtils.sys.mjs           # 请求编码、域名和 Cookie 工具函数
    ├── locales/
    │   ├── en-US/downloadit.ftl          # 英文 Fluent 消息
    │   └── zh-CN/downloadit.ftl          # 简体中文 Fluent 消息
    ├── options.xhtml                     # 设置页面结构
    ├── options.js                        # 设置页面逻辑
    └── options.css                       # 设置页面样式
pack.ps1                                  # XPI 打包脚本
pack.sh                                   # Linux XPI 打包脚本
tests/                                    # Node.js 单元测试
```

## 许可证与第三方组件

DownloadIt 是基于原 FlashGot 扩展的非官方现代化移植版。原 FlashGot 由 Giorgio Maone 创作，采用 GPL-2.0-or-later，相关说明见 [`addon/THIRD_PARTY_NOTICES.txt`](addon/THIRD_PARTY_NOTICES.txt)。

打包时随附的 `FlashGot.exe` 基于 [Grabby-FlashGot](https://github.com/benzBrake/Grabby-FlashGot)，采用 GPL-3.0；每个 XPI 包含与其中二进制匹配的 `chrome/content/DownloadItBinaryMetadata.sys.mjs`，用于运行时完整性校验。

英文版本请参阅 [README.md](README.md)。

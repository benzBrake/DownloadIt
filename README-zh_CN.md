# DownloadIt

[![Nightly build](https://img.shields.io/badge/nightly-download-blue?logo=firefox)](https://nightly.link/benzBrake/DownloadIt/workflows/nightly.yml/master/DownloadIt-nightly.zip)

DownloadIt 是面向现代 Firefox 的 FlashGot 下载桥接扩展移植版。它通过定制的 [`userChrome.js-Loader`](https://github.com/benzBrake/userChrome.js-Loader) 加载 bootstrapped XPI，并把网页链接交给外部下载管理器处理。

当前版本处于迁移阶段，目标平台为 Windows，Firefox 最低版本为 136.0。

## 当前功能

- 在网页链接的右键菜单中提供 DownloadIt 菜单。
- 在有选区且选区包含链接时，在其下方提供“使用 DownloadIt 下载选中链接”。
- 提供“使用 DownloadIt 批量下载”链接选择器，可收集、筛选并批量下载当前文档及其 frame 中的显式页面链接。
- 自动检测 `FlashGot.exe` 支持的可用下载管理器，并允许选择默认工具。
- 显示每个下载器对 POST、Cookie、批量提交和下载目录的支持情况。
- 提供始终可用且不经过 `FlashGot.exe` 的 Firefox 内建下载器。
- 支持不经过 `FlashGot.exe` 的自定义命令行下载器和 aria2 JSON-RPC。
- 可选将 [hmjz100/LinkSwift](https://github.com/hmjz100/LinkSwift) 等脚本/扩展发出的兼容 IDM 本地 HTTP 请求转交给当前默认下载器。
- 在 Firefox 原生下载弹窗中为支持的下载加入 DownloadIt 选项。
- 可以记住支持的文件扩展名，并自动交给当前默认下载工具。
- 支持 `http`、`https`、`ftp` 和 `magnet` 链接。
- 向外部下载工具传递 URL、文件名、Referer、Cookie 和 User-Agent；Firefox 内建下载器使用原生浏览与 Cookie 上下文。
- 在 Firefox 设置对话框中管理默认下载工具和 Cookie 转发策略。
- 提供独立的“自动接管”设置标签页，用于管理已记住的自动处理扩展名。
- 界面和右键菜单支持简体中文与英文。
- 使用 Firefox 内置的 Fluent 资源存储界面消息。
- 构建时校验并在运行时校验随扩展发布的 `FlashGot.exe`。

当前尚未实现：

- 广泛的未知文件类型拦截；
- 媒体嗅探；
- 原 FlashGot 的完整选项页及其他高级功能。

## 工作方式

```text
Firefox 右键菜单、原生下载弹窗、已记住扩展名的 hook，
或已启用的 IDM 本地协议 hook
        │
        ▼
DownloadIt 后台服务
        │
        ├── native provider ── Firefox Downloads API
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
- Firefox 内建下载器始终可用，因此外部下载管理器不是必需项；
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

测试覆盖单链接和多链接下载任务 JSON、URL 和文件名校验、选区及页面链接提取、批量链接类型与后缀筛选、选择状态、下载管理器解析、工具栏 PanelView 与右键菜单插入点、已记住扩展名的自动接管与回退、IDM 本地端点与字节级消息解析、原生下载弹窗集成、Fluent 资源，以及设置页面的暂存结构。

DownloadIt 批量下载会从当前 DOM、子 frame 和开放的 Shadow DOM 中收集显式的 `a[href]` 与 `area[href]` 链接。类型和后缀筛选均支持多选：同一筛选器内按“或”匹配，并与搜索条件按“且”组合。分类依据下载文件名或 URL 后缀判断；媒体元素资源和网络层媒体嗅探不属于此功能。

设置页的“链接分组”标签可以启用或禁用各个内置后缀分组，也可以修改其管理的后缀。自定义分组必须填写显示名称、唯一的 kebab-case key 和至少一个后缀；启用后会出现在类型筛选器中。每个后缀只能属于一个分组，禁用的分组也参与冲突检查，以保证以后重新启用时不会产生含糊的分类规则。禁用分组中的后缀和未命中的后缀会归入“其他”。

## 安装与升级

1. 先安装并确认 `userChrome.js-Loader` 已在目标 Firefox profile 中生效。
2. 执行构建命令生成 `addon.xpi`。
3. 在 Firefox 打开 `about:addons`，选择齿轮菜单中的“从文件安装附加组件”，选中 `addon.xpi`。
4. 重启 Firefox，使扩展和浏览器窗口中的右键菜单完成初始化。

升级时使用新构建的 `addon.xpi` 覆盖安装即可。若扩展未启动，请先确认 Loader 版本、Firefox 版本和 profile 是否匹配，再检查 `about:addons` 中的扩展状态。

## 配置

DownloadIt 工具栏按钮会打开 Firefox 原生面板。使用“使用 DownloadIt 批量下载”可为当前标签页打开批量链接选择器；选择可用工具可立即切换默认下载工具；“重新检测下载工具”会刷新已检测工具列表；面板底部还可以进入 DownloadIt 设置。按钮首次启用时会加入导航栏，也可以通过 Firefox 的“定制工具栏”界面移动或移除。

设置页的已发现工具列表会显示当前 DownloadIt 集成路径的能力元数据：`+` 表示支持，`-` 表示不支持，`?` 表示目前尚不明确。标签分别表示 POST 请求正文、Cookie 处理、DownloadIt 批量提交，以及由调用方指定下载目录。native provider 使用 Firefox 自己的请求上下文，FlashGot 能力取决于随附桥接程序实现的集成，自定义命令的能力根据参数占位符推导，aria2 的能力则取决于 JSON-RPC provider。这些标签描述的是 DownloadIt 能否通过当前路径传递相应数据，并不代表下载器本身提供的全部功能。

工具栏面板、右键菜单中的“DownloadIt 设置”或 `about:addons` 中的扩展设置都可以打开设置页面。

| 偏好 | 类型 | 说明 |
| --- | --- | --- |
| `downloadit.defaultDM` | 字符串 | JSON 下载器引用，例如 `{"provider":"native","id":"firefox"}`、`{"provider":"flashgot","id":"Internet Download Manager"}` 或 `{"provider":"custom","id":"<uuid>"}`。旧版 FlashGot 名称会自动迁移。 |
| `downloadit.omitCookies` | 布尔值 | 为 `true` 时不向外部下载工具发送 Cookie；默认值为 `false`。 |
| `downloadit.idmBridgeEnabled` | 布尔值 | 接管兼容的 IDM 本地 HTTP 请求并发送到当前默认下载器；默认值为 `false`。 |
| `downloadit.detectedManagers` | 字符串 | 下载管理器检测缓存，由扩展自动维护。 |
| `downloadit.autoExtensions` | 字符串 | 应自动发送到当前默认下载工具的文件扩展名 JSON 数组。 |
| `downloadit.linkGroups` | 字符串 | 内置及自定义批量链接后缀分组的版本化 JSON 配置。 |

当偏好被 Firefox 策略锁定时，设置页面会显示锁定状态并禁止修改。已记住的扩展名可以在“自动接管”标签页逐项移除或全部清除。

只有用户明确记住的扩展名会被自动接管。空扩展名、Firefox 安装包（`.xpi`/`xpinstall`）以及不支持的 URL 协议始终保留在 Firefox 原生流程中；`.exe` 等可执行文件扩展名可以由用户明确记住。当 Firefox 内建下载器是默认项时，已记住扩展名的 hook 也会保留现有原生 launcher，不会再次请求同一地址。

### IDM 本地协议兼容

在“请求与隐私”中启用后，DownloadIt 会识别 [hmjz100/LinkSwift](https://github.com/hmjz100/LinkSwift) 等兼容扩展客户端使用的 IDM 本地 HTTP 请求格式：`POST http://127.0.0.1:1001/client/<id>?seq=<seq>`。它要求请求来自 Firefox 扩展 principal，并校验按字节声明长度的 `MSG#` 请求体，再把请求重定向到 DownloadIt 自己的临时回环监听器。任务会提交给当前默认下载器，下载器接受或拒绝任务后，请求客户端会收到预期的序号响应。

DownloadIt 不会绑定 `1001` 端口、替换 IDM 的原生监听器，也不会拦截 IDM 的 WebSocket 端点。它不是通用的端口转发代理：无法识别、格式错误和并非来自扩展的请求都会保持原样。兼容请求提供的 Cookie 对外部下载器仍受 `downloadit.omitCookies` 控制；native provider 不会注入该原始 Cookie 字段，而是使用 Firefox Cookie jar。桥接只接受下载 URL、文件名、来源页、User-Agent、Referer 和 Cookie 字段，且默认关闭。

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

`native:firefox` provider 接受 HTTP、HTTPS、批量链接和 POST 请求体。它会继承来源 frame 可用的 principal、Referer、容器、隐私浏览和 Cookie jar 上下文。下载直接进入 Firefox 首选下载目录，使用 `.part` 文件；目标文件已存在时按 `name(1).ext` 形式生成唯一名称。文件名优先使用显式名称，其次取 URL 最后一个路径段，最后回退为 `download`。DownloadIt 不会额外探测重定向或 `Content-Disposition`，因此签名 URL、一次性 URL 和 POST 地址只请求一次。该 provider 会显示在 DownloadIt 菜单和设置中，但不会出现在 Firefox 自己的下载弹窗里，因为其中已有等价的“保存文件”操作。FTP 和 magnet 链接需要使用外部 provider。

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
    ├── DownloadItIDMBridge.sys.mjs      # Firefox 请求 hook 和回环响应桥
    ├── DownloadItIDMProtocol.sys.mjs    # IDM 本地端点和字节级消息解析
    ├── DownloadItXUL.sys.mjs             # 共享的 Firefox XUL 元素构造工具
    ├── DownloadItLinkCollectorActor.sys.mjs # 选区与页面链接提取 Actor
    ├── DownloadItLinks.sys.mjs           # 页面链接查询、分类、筛选与选择状态
    ├── DownloadItLocalization.sys.mjs   # Firefox Fluent 资源注册
    ├── DownloadItProtocol.sys.mjs       # 下载任务协议和校验
    ├── DownloadItUtils.sys.mjs           # 请求编码、域名和 Cookie 工具函数
    ├── locales/
    │   ├── en-US/downloadit.ftl          # 英文 Fluent 消息
    │   └── zh-CN/downloadit.ftl          # 简体中文 Fluent 消息
    ├── options.xhtml                     # 设置页面结构
    ├── options.js                        # 设置页面逻辑
    ├── options.css                       # 设置页面样式
    ├── links.xhtml                       # 批量链接选择器结构
    ├── links.js                          # 批量链接选择器行为
    └── links.css                         # 批量链接选择器样式
pack.ps1                                  # XPI 打包脚本
pack.sh                                   # Linux XPI 打包脚本
tests/                                    # Node.js 单元测试
```

## 许可证与第三方组件

DownloadIt 是基于原 FlashGot 扩展的非官方现代化移植版。原 FlashGot 由 Giorgio Maone 创作，采用 GPL-2.0-or-later，相关说明见 [`addon/THIRD_PARTY_NOTICES.txt`](addon/THIRD_PARTY_NOTICES.txt)。

打包时随附的 `FlashGot.exe` 基于 [Grabby-FlashGot](https://github.com/benzBrake/Grabby-FlashGot)，采用 GPL-3.0；每个 XPI 包含与其中二进制匹配的 `chrome/content/DownloadItBinaryMetadata.sys.mjs`，用于运行时完整性校验。

英文版本请参阅 [README.md](README.md)。

# DownloadIt

<img src="addon/chrome/content/icons/downloadit.svg" alt="DownloadIt 图标" width="128">

[![Nightly build](https://img.shields.io/badge/nightly-download-blue?logo=firefox)](https://nightly.link/benzBrake/DownloadIt/workflows/nightly.yml/master/DownloadIt-nightly.zip)

DownloadIt 是面向现代 Firefox 的 FlashGot 下载桥接扩展移植版。它通过定制的 [`userChrome.js-Loader`](https://github.com/benzBrake/userChrome.js-Loader) 加载 bootstrapped XPI，并把网页链接交给外部下载管理器处理。

当前版本处于迁移阶段，支持 Windows 和 Linux，Firefox 最低版本为 136.0。

## 当前功能

- 在网页链接的右键菜单中提供 DownloadIt 菜单。
- 在有选区且选区包含链接时，在其下方提供“使用 DownloadIt 下载选中链接”。
- 提供“使用 DownloadIt 批量下载”链接选择器，可收集、筛选（包括磁力链接）、复制选中链接并批量下载当前文档及其 frame 中的显式页面链接。
- 在 Windows 上自动检测 `FlashGot.exe` 支持的可用下载管理器，并允许选择默认工具。
- 显示每个下载器对 POST、Cookie、批量提交、下载目录和任务启动控制的支持情况。
- 提供始终可用且不经过 `FlashGot.exe` 的 Firefox 内建下载器。
- 通过 JDownloader 的本地 FlashGot 端点直接集成，不经过 `FlashGot.exe`。
- 通过 AB Download Manager 的本地 HTTP API 直接集成，不经过 `FlashGot.exe`。
- 通过 Xtreme Download Manager 的内置回环 API 直接集成，不经过 `FlashGot.exe`。
- 通过跨平台静默命令行接口直接集成 uGet，不经过 `FlashGot.exe`。
- 在 Windows 和 Linux x86_64 上通过 JSON-RPC 直接集成随包提供的 Aria2Next，不经过 `FlashGot.exe`。
- 将随包提供的 AriaNg 标准前端资源包注册为仅允许回环 RPC 的内部 `moz-extension://` 页面。
- 支持不经过 `FlashGot.exe` 的自定义命令行下载器和 aria2 JSON-RPC。
- 可选将 [hmjz100/LinkSwift](https://github.com/hmjz100/LinkSwift) 等脚本/扩展发出的兼容 IDM 本地 HTTP 请求转交给当前默认下载器。
- 在 Firefox 原生下载弹窗中为支持的下载加入 DownloadIt 选项。
- 为文件类型自动接管提供白名单和黑名单，并由黑名单优先判定。
- 支持 `http`、`https`、`ftp` 和 `magnet` 链接。
- 向外部下载工具传递 URL、文件名、Referer、Cookie 和 User-Agent；Firefox 内建下载器使用原生浏览与 Cookie 上下文。
- 在 Firefox 设置对话框中管理默认下载工具、任务启动行为和 Cookie 转发策略。
- 提供独立的“自动接管”设置标签页，用于编辑黑白名单并查看内置保护规则。
- 提供可选的 GitHub 镜像适配器和可配置端点，并通过注册表结构支持以后增加 Hugging Face 等站点。
- 界面和右键菜单支持简体中文与英文。
- 使用 Firefox 内置的 Fluent 资源存储界面消息。
- 构建时校验随扩展发布的 `FlashGot.exe`，并在 Windows 运行时再次校验。

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
        ├── flashgot provider（Windows）── 临时任务 JSON ── FlashGot.exe
        ├── jdownloader provider ── 回环 HTTP `/flashgot`
        ├── abdm provider ── 回环 HTTP `/queues` 和 `/add`
        ├── xdm provider ── 回环 HTTP `/sync`、`/download` 和 `/link`
        ├── uget provider ── uGet 静默命令行 ── Firefox 原生进程 API
        ├── aria2next provider ── 包内原生进程 ── JSON-RPC
        ├── 自定义命令 provider ── Firefox 原生进程 API
        └── 自定义 aria2 provider ── JSON-RPC
```

在 Windows 上，扩展启动时会把 XPI 中的 `FlashGot.exe` 部署到 Firefox profile 下的 `DownloadIt\FlashGot.exe`，然后使用以下命令行接口与它通信：

- `--list-json`：检测可用下载管理器；
- `--job-json`：提交单链接或多链接下载任务。

Linux 会跳过部署，且不会运行 XPI 中的 Windows FlashGot helper。Linux x86_64 上会以 `0755` 权限部署包内 Aria2Next 可执行文件；所有受支持的 Linux 安装仍会正常初始化其余服务。

## 平台支持

Windows 和 Linux 发布同一个通用 XPI。该文件包含 Windows helper 和 Linux x86_64 Aria2Next 可执行文件，运行时根据平台和 ABI 只选择适用的二进制。

macOS、Snap Firefox 和 Flatpak Firefox 暂不在支持范围内。

| 集成 | Windows | Linux |
| --- | --- | --- |
| Firefox 原生下载 | 支持 | 支持 |
| 自定义命令 | 支持 | 支持 |
| aria2 JSON-RPC 与可选本地启动 | 支持 | 支持 |
| JDownloader 端点与可选本地启动 | 支持 | 支持 |
| AB Download Manager 回环 API | 支持 | 支持 |
| Xtreme Download Manager 回环 API | 支持 | 支持 |
| uGet 静默命令行 provider | 支持 | 支持 |
| 包内 Aria2Next provider | 支持 | x86_64 上支持 |
| FlashGot 下载器发现与任务提交 | 支持 | 不使用 |
| 部署包内 `FlashGot.exe` | 启用 | 跳过 |

## 使用前提

- Windows，或使用发行版原生包/Mozilla tarball 的 Linux；
- Firefox 136.0 或更高版本；
- 已安装并正常配置的定制 `userChrome.js-Loader`。建议使用该 Loader 20250219 之后的版本（兼容 Firefox 135+）；
- Linux 上为自定义命令、aria2 自动启动或 JDownloader 自动启动选择的文件必须具有 Unix 可执行权限，例如 `chmod +x /path/to/launcher`；
- Linux 首版不支持 Snap 和 Flatpak Firefox，因为其 Loader 安装、宿主文件访问和进程沙箱边界与非沙箱 Firefox 不同；
- Firefox 内建下载器始终可用，因此外部下载管理器不是必需项；
- 构建时如果缺少 `addon/FlashGot.exe`，两套打包脚本都会下载 [Grabby-FlashGot](https://github.com/benzBrake/Grabby-FlashGot) 最新成功构建的 nightly artifact。存在 `GITHUB_TOKEN` 或 `GH_TOKEN` 时通过 GitHub Actions API 下载，否则通过 nightly.link 下载。该二进制组件默认被 `.gitignore` 排除，不随 Git 仓库提交；打包时会将实际文件的大小和 SHA-256 写入 XPI 内的生成元数据，并用于运行时校验；
- 缺少 Aria2Next 资产时会从固定的 [AnInsomniacy/aria2-next](https://github.com/AnInsomniacy/aria2-next) `v2.5.5` Release 下载；已有或下载得到的 Windows x86_64 与 Linux x86_64 资产必须通过固定大小和 SHA-256 校验后才能打包；
- 缺少或过期的 AriaNg 资产时通过 GitHub CLI 从固定的 [mayswind/AriaNg](https://github.com/mayswind/AriaNg) `1.3.14` 标准 Release 下载；打包前会校验压缩包、解出的 `index.html`、外置 CSS、JS 和 Font Awesome WOFF2 资源，页面不含内联脚本且不需要 `unsafe-eval`；
- 开发和测试需要 Node.js 18 或更高版本；
- 在 Windows 上构建需要 PowerShell 7（`pwsh`）；
- 在 Linux 上构建需要 Bash、GitHub CLI、`curl`、`zip`、`unzip`、`sha256sum` 和 GNU coreutils；使用带认证的 GitHub API 路径时还需要 `jq`。

## 构建

在仓库根目录执行对应平台的命令。

Windows：

```powershell
pwsh -ExecutionPolicy Bypass -File .\pack.ps1
```

Linux：

```bash
./pack.sh
```

两套脚本都会把 `addon/` 打包为相同的通用 `addon.xpi` 格式，并检查 XPI 至少包含：

- `bootstrap.js`；
- `install.rdf`；
- `chrome.manifest`；
- `FlashGot.exe`；
- `aria2-next.exe`；
- `aria2-next-linux-x86_64`；
- `ariang/index.html` 和 `ariang/manifest.json`；
- `licenses/aria2-next-COPYING` 和 `licenses/ariang-LICENSE`；
- `chrome/content/DownloadItAriaNg.sys.mjs`。

`addon.xpi` 是构建产物，默认被 `.gitignore` 忽略。`addon/FlashGot.exe`、`addon/aria2-next.exe`、`addon/aria2-next-linux-x86_64` 和生成的 AriaNg 标准资源树也不纳入版本控制。缺少 Aria2Next 资产或 AriaNg 资产缺失、过期时从各自的固定上游 Release 下载；最终资产校验失败时构建会停止，不会将错误文件打入包内。Nightly 仍只发布一个通用 XPI，不拆分平台构建产物。

## 版本规则

DownloadIt 从 `2.0.0` 开始使用自己的版本线；当前版本为 `2.7.2`；继承自 FlashGot 的版本线终止于 `1.5.6.14.2`。发布版本采用 `MAJOR.MINOR.PATCH`：不兼容的配置、数据格式或行为变更递增 `MAJOR`；向后兼容的新功能递增 `MINOR`；向后兼容的修复、安全更新和 Firefox 兼容性调整递增 `PATCH`。

`addon/install.rdf` 中的版本只标识 DownloadIt XPI，也是设置页显示版本的唯一来源。随包提供的 `FlashGot.exe` 是独立构建的辅助组件，其完整性通过构建时生成的文件大小和 SHA-256 元数据跟踪；该组件的版本不再拼接到 DownloadIt 版本中。

## 测试

测试使用 Node.js 内置测试运行器：

```powershell
node --test .\tests\*.test.mjs
```

测试覆盖单链接和多链接下载任务 JSON、URL 和文件名校验、选区及页面链接提取、批量链接筛选与复制、下载管理器解析、JDownloader、AB Download Manager、Xtreme Download Manager、uGet、Aria2Next 平台部署与 JSON-RPC 行为、嵌入式 AriaNg 生命周期和权限边界、工具栏 PanelView 与右键菜单插入点、自动接管、IDM 本地协议解析、原生下载弹窗集成、Fluent 资源，以及设置页面的暂存结构。

DownloadIt 批量下载会从当前 DOM、子 frame 和开放的 Shadow DOM 中收集显式的 `a[href]` 与 `area[href]` 链接。类型和后缀筛选均支持多选：同一筛选器内按“或”匹配，并与搜索条件按“且”组合。独立的“仅磁力链接”筛选也会与这些条件组合。分类依据下载文件名或 URL 后缀判断；媒体元素资源和网络层媒体嗅探不属于此功能。选中的链接可以复制为每行一个 URL、制表符分隔的标题与 URL，或 Markdown 链接，且不会请求下载器。

设置页的“链接分组”标签可以启用或禁用各个内置后缀分组，也可以修改其管理的后缀。自定义分组必须填写显示名称、唯一的 kebab-case key 和至少一个后缀；启用后会出现在类型筛选器中。每个后缀只能属于一个分组，禁用的分组也参与冲突检查，以保证以后重新启用时不会产生含糊的分类规则。禁用分组中的后缀和未命中的后缀会归入“其他”。

## 安装与升级

1. 先安装并确认 `userChrome.js-Loader` 已在目标 Firefox profile 中生效。
2. 执行构建命令生成 `addon.xpi`。
3. 在 Firefox 打开 `about:addons`，选择齿轮菜单中的“从文件安装附加组件”，选中 `addon.xpi`。
4. 重启 Firefox，使扩展和浏览器窗口中的右键菜单完成初始化。

Linux 上请使用发行版原生包或 Mozilla tarball 版 Firefox 完成以上步骤，并确认 Loader 能访问目标 profile，所有已配置的本地启动器也具有可执行权限。Snap 和 Flatpak 不属于当前支持的安装方式。

升级时使用新构建的 `addon.xpi` 覆盖安装即可。若扩展未启动，请先确认 Loader 版本、Firefox 版本和 profile 是否匹配，再检查 `about:addons` 中的扩展状态。

## 配置

DownloadIt 工具栏按钮会打开 Firefox 原生面板。使用“使用 DownloadIt 批量下载”可为当前标签页打开批量链接选择器；选择可用工具可立即切换默认下载工具；“刷新下载工具”会刷新当前集成，同时在后台并发探测已启用的内建协议；Windows 上的内建 HTTP 超时不会延迟或导致 FlashGot 检测失败，Linux 则不会执行 FlashGot 扫描。面板底部还可以进入 DownloadIt 设置。按钮首次启用时会加入导航栏，也可以通过 Firefox 的“定制工具栏”界面移动或移除。

对于受支持的链接，直接选择 DownloadIt 右键子菜单中的下载工具只会使用该工具发送当前链接，不会更改已配置的默认下载工具。需要同时持久化所选工具时，使用独立的“设为默认并下载”子菜单。Firefox 策略可以禁用默认工具修改操作，而不会影响单次下载。

设置页的已发现工具列表会显示当前 DownloadIt 集成路径的能力元数据：`+` 表示支持，`-` 表示不支持，`?` 表示目前尚不明确。标签分别表示 POST 请求正文、Cookie 处理、DownloadIt 批量提交、由调用方指定下载目录，以及控制提交任务是否自动开始。native provider 使用 Firefox 自己的请求上下文，FlashGot 能力取决于随附桥接程序实现的集成，JDownloader 和 Xtreme Download Manager 的能力取决于各自回环协议，自定义命令的能力根据参数占位符推导，aria2 的能力则取决于 JSON-RPC provider。这些标签描述的是 DownloadIt 能否通过当前路径传递相应数据，并不代表下载器本身提供的全部功能。

工具栏面板、右键菜单中的“DownloadIt 设置”或 `about:addons` 中的扩展设置都可以打开设置页面。

下载工具列表对可配置的集成提供统一入口。“添加下载工具”弹窗默认选中“内建协议”标签和 JDownloader；“自定义”标签用于创建可重复添加的命令行或 aria2 定义。JDownloader、AB Download Manager、Xtreme Download Manager、uGet 和 Aria2Next 都是单例：配置操作会重新打开对应条目。移除内建协议会禁用并清理其独立偏好。AB Download Manager 和 XDM 在本地服务响应或配置绝对启动器路径后即可选择；XDM 还接受 JAR 路径；uGet 只有在明确启用并为当前系统配置绝对启动器路径后才可选择；Aria2Next 只有在受支持的平台和 ABI 上启用且 `aria2.getVersion` 探测成功后才可选择。回环 provider 只会在明确测试或提交时启动配置的程序；uGet 会为每个任务直接调用静默命令行，不会探测后台 API。经 FlashGot 提供的下载器仍然来自自动检测；由于 DownloadIt 侧没有需要编辑的配置，它们不会出现在添加工具目录中。

| 偏好 | 类型 | 说明 |
| --- | --- | --- |
| `downloadit.defaultDM` | 字符串 | JSON 下载器引用，例如 `{"provider":"native","id":"firefox"}`、`{"provider":"jdownloader","id":"jdownloader"}`、`{"provider":"flashgot","id":"Internet Download Manager"}` 或 `{"provider":"custom","id":"<uuid>"}`。旧版 FlashGot 名称会自动迁移。 |
| `downloadit.omitCookies` | 布尔值 | 为 `true` 时不向外部下载工具发送 Cookie；默认值为 `false`。 |
| `downloadit.autoStartTasks` | 布尔值 | 请求具有任务启动能力的 provider 自动开始任务；默认值为 `true`，当前由 JDownloader 和 AB Download Manager 使用。 |
| `downloadit.abdm.enabled` | 布尔值 | 启用 AB Download Manager 回环 provider。 |
| `downloadit.abdm.endpoint` | 字符串 | AB Download Manager API 端点。只接受 HTTP 回环 URL；默认值为 `http://127.0.0.1:15151/`。 |
| `downloadit.abdm.apiKey` | 字符串 | 可选 API key，会作为 `X-Api-Key` 发送；不会与 JDownloader 或 FlashGot 共用。 |
| `downloadit.abdm.launchPath` | 字符串 | 可选的 AB Download Manager 启动器绝对路径。本地 API 离线时，DownloadIt 只会在明确测试连接或提交下载时使用该路径。 |
| `downloadit.xdm.enabled` | 布尔值 | 启用 Xtreme Download Manager 回环 provider。它探测固定的 `http://127.0.0.1:8597/sync` 端点；默认值为 `true`。 |
| `downloadit.xdm.launchPath` | 字符串 | 可选的 XDM 启动器或 JAR 绝对路径。Linux 下的 JAR 会使用系统 Java 运行；本地 API 离线时，DownloadIt 只会在明确测试连接或提交下载时使用该路径。 |
| `downloadit.uget.enabled` | 布尔值 | 启用 uGet 静默命令行 provider。新安装默认禁用，直到用户配置 uGet。 |
| `downloadit.uget.launchPath` | 字符串 | 当前系统上的 uGet 启动器绝对路径。DownloadIt 会对每个提交的链接使用 `--quiet` 调用它。 |
| `downloadit.aria2next.enabled` | 布尔值 | 在 Windows 或 Linux x86_64 上启用包内 Aria2Next provider。 |
| `downloadit.aria2next.rpcPort` | 整数 | 回环 JSON-RPC 端口；默认值为 `6800`。 |
| `downloadit.aria2next.secret` | 字符串 | 可选 RPC 密钥，以明文保存并作为 aria2 token 传递。 |
| `downloadit.aria2next.downloadDir` | 字符串 | 可选下载目录；留空时使用 Firefox 首选下载目录。 |
| `downloadit.aria2next.extraArgs` | 字符串 | 不会覆盖 DownloadIt 所管理 RPC 参数的额外进程参数。 |
| `downloadit.aria2next.exitOnClose` | 布尔值 | Firefox 退出时发送 `aria2.shutdown`；优雅关闭失败时只终止由 DownloadIt 启动的 Aria2Next 进程。 |
| `downloadit.jdownloader.enabled` | 布尔值 | 控制是否已配置并显示 JDownloader 内建协议集成。新安装默认为 `false`；已有 JDownloader 偏好或将 JDownloader 设为默认工具的旧配置会迁移为启用状态，直到用户明确移除。 |
| `downloadit.jdownloader.endpoint` | 字符串 | JDownloader FlashGot 端点；默认值为 `http://127.0.0.1:9666/flashgot`。 |
| `downloadit.jdownloader.launchPath` | 字符串 | 可选的 JDownloader Windows `.exe`、Linux 可执行启动器或 `.jar` 绝对路径；手动值优先于检测结果。 |
| `downloadit.jdownloader.autoLaunch` | 布尔值 | 端点不可用时启动 JDownloader；默认值为 `true`。 |
| `downloadit.jdownloader.detectedPath` | 字符串 | 成功 GET 探测返回的安装路径，由扩展自动维护。 |
| `downloadit.jdownloader.detectedJavaArgs` | 字符串 | 成功 GET 探测返回并经过验证的 JVM 参数 JSON 数组，由扩展自动维护。 |
| `downloadit.idmBridgeEnabled` | 布尔值 | 接管兼容的 IDM 本地 HTTP 请求并发送到当前默认下载器；默认值为 `false`。 |
| `downloadit.detectedManagers` | 字符串 | FlashGot 下载管理器检测缓存，由扩展自动维护。 |
| `downloadit.linkGroups` | 字符串 | 内置及自定义批量链接后缀分组的版本化 JSON 配置。 |
| `downloadit.mirrors` | 字符串 | 内建镜像适配器的版本化 JSON 配置。GitHub 适配器默认关闭，并预填 `https://gh-proxy.com/`。 |

当偏好被 Firefox 策略锁定时，设置页面会显示锁定状态并禁止修改。

### 自动接管规则

用户规则以格式化 UTF-8 JSON 保存在 Firefox profile 下的 `DownloadIt\auto-capture-rules.json`。文件使用稳定 UUID 和带类型的匹配器，因此以后增加域名等匹配类型时不需要再次迁移存储位置。当前版本接受扩展名匹配器：

```json
{
  "version": 1,
  "rules": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "action": "allow",
      "match": {
        "type": "extension",
        "value": "zip"
      }
    }
  ]
}
```

首次保存规则时才会创建该文件，并通过原子写入更新。JSON 无效、匹配项重复、ID 无效或版本不受支持时会保留原文件且禁止覆盖，同时停用自动接管，直到用户从设置页重新加载或明确重置。用户黑白名单规则可以在“自动接管”标签页添加、逐项移除或分别清空。

自动接管按黑名单优先判定：内置和用户黑名单优先，用户白名单中的类型会被接管，未出现在两张名单中的类型继续进入 Firefox 原生下载提示。下载目标会先于用户规则分类：普通 `http`、`https`、`ftp` 和 `magnet` 目标可以转交；`blob:` 和 `data:` 资源的数据属于创建它的浏览器上下文，因此始终留在 Firefox 原生流程；其他不支持的协议则会被过滤。`.xpi` 是不可修改的内置黑名单条目。HTTP 和 HTTPS 目标的解码路径以 `.xpi` 结尾或包含独立 `xpinstall` 路径标记时，所有 DownloadIt 入口都会拒绝转交；URL 含糊时还会结合 Firefox 提供的文件名、主扩展名和 MIME 元数据执行相同保护。查询参数、fragment 或主机名中的普通 `xpinstall` 文本不会触发路径规则。这些目标限制由代码维护，当前扩展名规则和未来域名规则都不能覆盖；Referer 和来源页面 URL 会单独校验，不会被误当成下载目标。空扩展名同样保持原生处理；`.exe` 等可执行文件扩展名可以明确加入白名单。当 Firefox 内建下载器是默认项时，hook 会保留现有原生 launcher，不会再次请求同一地址。

### 镜像适配器

实验性的“镜像加速”设置标签页展示由代码提供的站点适配器和用户可配置端点。适配器是通过 `MirrorAdapterRegistry` 注册的扩展特权模块；DownloadIt 不会从 profile 加载任意 JavaScript。站点 URL 语义因此保持隔离，以后增加 Hugging Face 等适配器时无需修改下载器分发流程。

内建 GitHub 适配器默认关闭，并预填 `https://gh-proxy.com/`。启用后，它按 `<端点><原始绝对 URL>` 格式为识别出的 HTTPS 文件链接添加前缀。支持 Release 资产、`/archive/`、`/zipball/`、`/tarball/`、仓库 `/raw/` 路由、`codeload.github.com` 和 `raw.githubusercontent.com`。普通 GitHub 页面、API URL 和临时 `objects.githubusercontent.com` URL 不会被猜测或改写。Firefox 保留匹配的原始 channel URI 时，原生下载弹窗会使用它；否则已重定向的对象 URL 保持不变。

镜像改写在每次 provider 分发前统一执行一次，覆盖右键菜单、批量下载、下载弹窗、自动接管、Firefox 原生下载和 IDM bridge。POST 下载任务不会改写。镜像链接会清除源站 Cookie 和 Cookie 记录；批量任务只要包含镜像链接，也会清除页面级 Cookie。公共端点必须使用 HTTPS，且不得包含认证信息、查询参数或 fragment；只有回环地址允许使用 HTTP。DownloadIt 不探测镜像健康状态，外部下载器接受镜像任务后也不会自动用原链接重试。外部提供的无效配置会回退为全部适配器关闭，且不会覆盖原偏好值。

### JDownloader provider

`jdownloader:jdownloader` provider 直接连接 JDownloader 的 FlashGot 兼容端点。只有用户明确添加该集成，或从已有配置迁移时，下载工具列表才会显示它的单例条目；可以从该条目进入配置或将其移除。有效且已启用的配置会立即进入可选下载器列表。扩展启动和手动刷新下载工具时，DownloadIt 会在后台并发探测已启用的内建协议，从而更新 JDownloader 在线状态和安装缓存；Windows 上这不会延迟 FlashGot 检测。不同 provider 的失败彼此隔离，同一已配置端点的并发探测会共享请求；请求结束时只有 JDownloader 仍处于启用状态且端点没有变化，结果才会保存。草稿连接测试和实际提交任务也可以探测端点。端点位于编辑器的高级设置中，必须是 `localhost`、`127.0.0.0/8` 或 `::1` 上无认证信息的 HTTP 地址，不允许查询参数或 fragment，路径统一规范化为 `/flashgot`。请求禁止重定向，探测 GET 也会绕过 HTTP 缓存。

成功的 GET 响应必须恰好包含两个非空行：第一行是绝对 `.jar` 路径，第二行是以同一路径结尾的 `java ... -jar` 命令。Windows drive/UNC 路径和 POSIX 绝对路径均可接受，并保留原始分隔符风格。DownloadIt 不执行也不保存返回的命令，只保留经过验证的 `-Xms` 和 `-Xmx` 参数。手动启动路径优先于检测缓存；手动路径失效时会明确报错，不会退回缓存。修改端点会清除旧检测缓存。设置页的连接测试只探测当前草稿端点，不保存草稿、不改变在线状态，也不启动进程。

提交时若端点离线且已启用自动启动，手动选择的本地启动器会由 Firefox 进程 API 直接运行。Windows 上启动 JAR 时，DownloadIt 会依次检查同名 `.exe`、`JDownloader2.exe`、`JDownloader 2.exe` 和 `JDownloader.exe`，然后查找包内 `jre`/`runtime`、`JAVA_HOME`、JavaSoft 注册表路径和 Windows System32，每处优先 `javaw.exe`，其次 `java.exe`。Linux 上会先检查同目录且具有执行权限的 `JDownloader2` 和 `JDownloader`，再依次查找包内 `jre`/`runtime`、`JAVA_HOME/bin/java` 以及 `PATH` 各目录中的可执行 `java`。Java 只接收已验证的 JVM 参数和 `-jar <路径>`，不会经过命令 shell。并发提交共享一次启动等待；DownloadIt 每 8 秒探测一次，最多 6 次，就绪后每个提交只 POST 一次，避免重试造成重复任务。

UTF-8 表单按换行严格对齐 `urls`、`descriptions` 和 `fnames`，并发送 `package=DownloadIt`、任务 Referer（缺失时使用下载页面 URL）以及可读取时的 Firefox 首选下载目录。`autostart` 取自 `downloadit.autoStartTasks`；关闭该偏好不会改变不具备任务启动能力的其他 provider。批量任务只有在所有链接 Cookie 完全相同时才发送 Cookie，否则整批省略。POST 数据全部为空时省略，全部相同时发送；混合或部分不同的 POST 正文会在探测或启动 JDownloader 之前拒绝该批次。下载密码和压缩包密码（`dpass`、`apass`）尚未实现。

### AB Download Manager provider

`abdm:abdm` provider 直接使用 AB Download Manager 的本地 HTTP API。启用后会在后台探测 `GET /queues`；相同 endpoint 和 API key 的并发探测会共享一次请求，endpoint 或 API key 变化后旧结果不会更新状态。配置绝对启动器路径后，即使 API 离线也可以选择该 provider。后台刷新不会启动 AB Download Manager。连接测试使用草稿值，不保存配置，也不改变已配置 provider 的在线状态；API 不可用且草稿中存在启动器路径时，明确测试会启动该程序并等待 API 就绪。提交下载也遵循同样的“先探测、再启动”行为。请求仅允许 HTTP 回环地址，禁止重定向并绕过 HTTP 缓存。

任务通过 `POST /add` 以 JSON 提交。每个 item 包含 `link`、`headers`、`downloadPage` 和 `suggestedName`；Cookie、Referer 和 User-Agent 会放入 item headers。`downloadit.autoStartTasks` 映射为请求 `options.silentStart`，`silentAdd` 始终为 `true`。AB Download Manager 不接收调用方指定的下载目录或 POST 请求正文，因此能力会标记为不支持，并拒绝无法完整传递的 POST 任务。

在 Windows 上，`FlashGot.exe --list-json` 仍可能返回 `AB Download Manager`。原生 provider 在线时会隐藏这个完全同名的 FlashGot 条目，离线时保留它作为回退路径。如果旧默认值是 FlashGot 的 `AB Download Manager` 条目，原生探测成功后会将其迁移为 `{"provider":"abdm","id":"abdm"}`，但不会修改被锁定的默认偏好。

### Xtreme Download Manager provider

`xdm:xdm` provider 直接连接 Xtreme Download Manager 固定的本地 HTTP API。它默认启用，`GET http://127.0.0.1:8597/sync` 返回包含 `enabled: true` 的有效 JSON，或 `downloadit.xdm.launchPath` 填入当前系统上的启动器或 JAR 绝对路径后即可成为可选下载器。Firefox 不会预先校验该路径，因此在文件选择器或 Firefox 文件 API 无法枚举、但实际可以运行启动器的环境中，手动输入的路径仍能使用。启动时和手动刷新下载工具时只会在后台探测该端点，相同并发探测会共享一个请求，并且请求会禁用重定向、绕过缓存。连接测试使用草稿值，不保存配置，也不改变已配置 provider 的在线状态。明确测试连接或提交下载遇到 API 离线时会尝试启动已配置路径并等待端点就绪；路径不可用时会在此时报告启动错误。

单个任务通过 `POST /download` 发送 JSON，批量任务通过 `POST /link` 发送数组。DownloadIt 会转发每个 URL、Cookie、User-Agent 与 Referer，并为单个任务转发建议文件名。XDM 不接收调用方指定目录、POST 请求正文或 DownloadIt 的任务启动偏好，因此带 POST 正文的任务会在提交前被拒绝。

### uGet provider

`uget:uget` provider 通过 Firefox 原生进程 API 直接调用配置的 uGet 可执行文件。它只接受当前系统上的启动器绝对路径，并且必须由用户明确启用和配置后才会启用。设置页测试会使用 `--version` 调用启动器；由于 uGet 没有 DownloadIt 可用的本地 API，后台刷新不会启动 uGet，也不会尝试进程发现。

每个链接都会作为独立的 `uget --quiet` 进程提交。DownloadIt 会按需将 Firefox 首选下载目录、文件名、Referer、User-Agent、Cookie 和非空 POST 正文分别以 `--option=value` 形式传递，并保持 URL 不变地放在最后。因此批量任务会为每个链接启动一次 uGet 命令。该 provider 报告支持 POST、Cookie、批量和目录，但不读取 `downloadit.autoStartTasks`；uGet 命令行没有按任务控制启动状态的开关。进程成功启动即视为 uGet 已接受任务；进程 API 边界之外的后续下载失败不由 Firefox 获取。

### Aria2Next provider

`aria2next:aria2next` provider 从通用 XPI 部署固定的 Aria2Next `v2.5.5` 二进制，并通过 `http://127.0.0.1:<端口>/jsonrpc` 通信。Windows 保持原有的 profile 路径 `DownloadIt\aria2-next.exe`；Linux x86_64 使用 `DownloadIt/aria2-next`。运行时会校验文件大小和 SHA-256，Firefox 在直接通过原生进程 API 启动前将 Linux 文件权限设为 `0755`。其他 Linux 架构不能启用该内建 provider，但仍可使用自定义 aria2 JSON-RPC provider 连接外部管理的服务。

### 嵌入式 AriaNg 页面

DownloadIt 将固定的 AriaNg `1.3.14` 标准资源页面作为内部 ID 为 `downloadit-ariang@downloadit.invalid` 的嵌入式 Firefox WebExtension 启动。Firefox 为其分配并持久化 profile 专属 UUID，在父进程和内容进程中注册对应的 `moz-extension://<uuid>/index.html` 来源，并在 DownloadIt 关闭时注销。只有 Aria2Next 已启用、当前平台受支持且 RPC 探测成功后，DownloadIt PanelView 才显示“打开 AriaNg”入口；该入口会在可信标签页打开当前 URL，并在注册成功前保持禁用。入口通过内部 `getAriaNgURL()` API 获取 URL，不会硬编码 UUID。启用 Aria2Next 后，AriaNg Actor 会在页面载入时用 DownloadIt 当前的回环配置同步默认 RPC profile，同时保留其他 AriaNg 偏好和额外 RPC profile。

嵌入式 Manifest 只授予 `127.0.0.1` 和 `localhost` 主机权限。CSP 只允许同源脚本，因此标准资源包的外置脚本无需 `unsafe-inline` 或 `unsafe-eval`；打包时会加入 Angular 的 `ng-csp="no-unsafe-eval"` 标记，让它选择兼容 CSP 的表达式解析器。页面仍保留 AriaNg 所需的内联样式，同时把 HTTP 和 WebSocket 连接限制在这些回环主机。该嵌入式页面有意不支持远程 aria2 RPC 主机。

DownloadIt 管理回环监听地址、端口、可选密钥和下载目录参数，并在 `aria2.getVersion` 成功后才提供该 provider。链接通过 `system.multicall` 提交，可以传递文件名、Referer、User-Agent、Cookie 和下载目录。启用退出时关闭后，DownloadIt 会发送 `aria2.shutdown` 并短暂等待；只有优雅关闭失败时才会强制终止由自身启动的进程实例。删除或禁用 Aria2Next 时，即使未启用退出时关闭，DownloadIt 也会发送 `aria2.shutdown`，因此可以在设置中关闭跨 Firefox 重启继续运行的进程。

### IDM 本地协议兼容

在“请求与隐私”中启用后，DownloadIt 会识别 [hmjz100/LinkSwift](https://github.com/hmjz100/LinkSwift) 等兼容扩展客户端使用的 IDM 本地 HTTP 请求格式：`POST http://127.0.0.1:1001/client/<id>?seq=<seq>`。它要求请求来自 Firefox 扩展 principal，并校验按字节声明长度的 `MSG#` 请求体，再把请求重定向到 DownloadIt 自己的临时回环监听器。任务会提交给当前默认下载器，下载器接受或拒绝任务后，请求客户端会收到预期的序号响应。

DownloadIt 不会绑定 `1001` 端口、替换 IDM 的原生监听器，也不会拦截 IDM 的 WebSocket 端点。它不是通用的端口转发代理：无法识别、格式错误和并非来自扩展的请求都会保持原样。兼容请求提供的 Cookie 对外部下载器仍受 `downloadit.omitCookies` 控制；native provider 不会注入该原始 Cookie 字段，而是使用 Firefox Cookie jar。桥接只接受下载 URL、文件名、来源页、User-Agent、Referer 和 Cookie 字段，且默认关闭。

### 自定义下载器

自定义定义以格式化 UTF-8 JSON 保存在 Firefox profile 下的 `DownloadIt\custom-downloaders.json`。“内建协议”标签不会向该文件写入条目：JDownloader、AB Download Manager 和 Xtreme Download Manager 使用各自的 Firefox 偏好命名空间，FlashGot 检测结果使用 `downloadit.detectedManagers`。扩展启动时读取自定义文件，设置页也可以手动重新加载。JSON 无效或版本不受支持时会保留原文件并禁止覆盖；只有显式使用重置操作才会用空配置替换损坏文件。损坏的自定义文件只会禁用“自定义”标签，内建协议仍可配置。

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

Firefox 的 chrome 配置目录（`UChrm`，通常为 `<profile>/chrome`）内的可执行文件和 aria2 配置文件会以该目录为基准，使用正斜杠保存相对路径，例如 `UserTools/aria2/aria2c.exe`、`UserTools/aria2/aria2c` 和 `UserTools/aria2/aria2.conf`。相对路径始终基于 `UChrm` 解析；目录外的文件继续保存绝对路径。在另一操作系统保存的绝对路径会继续保留，但在当前平台显示为不可用。

Windows 上的自定义下载器默认隐藏进程窗口。取消“隐藏运行”后，命令行进程或自动启动的 aria2c 进程会在前台显示，便于调试。Firefox 的 `nsIProcess.startHidden` 在 Linux 不生效，因此 Linux 会隐藏此控件，同时保留 `startHidden` JSON 字段以维持 schema 和跨平台配置兼容性。旧 JSON 没有该字段时继续使用当前默认值。

命令行下载器需要选择可执行文件并填写参数模板；Linux 上所选文件必须具有执行权限。编辑器提供 `aria2c`、`wget` 和 `curl` 快捷模板。DownloadIt 默认使用 Firefox 原生进程 API 直接启动程序；若 Firefox 无法枚举 Linux 可执行文件，才会以固定参数使用 `/bin/sh` 回退：先通过 `test -f "$1" && test -x "$1"` 检查路径，再通过 `exec "$@"` 启动。可执行文件路径和模板参数始终作为独立进程参数传递，绝不会插入 shell 代码。支持的 FlashGot 兼容占位符包括 `URL`、`FNAME`、`COMMENT`、`REFERER`、`COOKIE`、`CFILE`、`FOLDER`、`POST`、`RAWPOST`、`HEADERS`、`ULIST`、`UFILE`、`USERPASS` 和 `UA`。模板包含 `ULIST` 或 `UFILE` 时整批只启动一个进程，否则每个链接分别启动一个进程。URL 列表和 Netscape Cookie 临时文件在 Windows 使用 CRLF，在 Linux 使用 LF；HTTP header 块在两个平台仍使用协议要求的 CRLF。

aria2 定义通过 HTTP 或 HTTPS JSON-RPC 连接，支持可选密钥和服务端下载目录；多链接使用 `system.multicall` 提交。本地启动配置可选填写 `executablePath` 和 `configurationPath`：只有启用自动启动时可执行文件才是必填项，配置文件可以始终留空；填写配置文件后，DownloadIt 会把解析后的路径作为 `--conf-path` 传给 aria2c。可选的 aria2c 自动启动仅适用于 HTTP 回环地址，DownloadIt 会管理配置文件路径、RPC 开关、监听地址、端口和密钥参数，等待最多五秒后重试一次请求。删除或禁用自定义条目以及 Firefox 退出时，DownloadIt 会关闭由自身启动的 aria2c 实例；不会强制终止外部管理的进程。RPC 密钥以明文保存在 JSON 文件中，但不会写入 DownloadIt 日志。

`native:firefox` provider 接受 HTTP、HTTPS、批量链接和 POST 请求体。它会继承来源 frame 可用的 principal、Referer、容器、隐私浏览和 Cookie jar 上下文。下载直接进入 Firefox 首选下载目录，使用 `.part` 文件；目标文件已存在时按 `name(1).ext` 形式生成唯一名称。文件名优先使用显式名称，其次取 URL 最后一个路径段，最后回退为 `download`。DownloadIt 不会额外探测重定向或 `Content-Disposition`，因此签名 URL、一次性 URL 和 POST 地址只请求一次。该 provider 会显示在 DownloadIt 菜单和设置中，但不会出现在 Firefox 自己的下载弹窗里，因为其中已有等价的“保存文件”操作。FTP 和 magnet 链接需要使用外部 provider。

## 项目结构

```text
addon/
├── bootstrap.js                         # 扩展生命周期入口
├── install.rdf                           # bootstrapped XPI 元数据
├── chrome.manifest                       # chrome://downloadit 注册
├── FlashGot.exe                          # 下载管理器桥接程序
├── aria2-next.exe                        # 固定的 Windows x86_64 Aria2Next 二进制
├── aria2-next-linux-x86_64               # 固定的 Linux x86_64 Aria2Next 二进制
├── licenses/aria2-next-COPYING           # Aria2Next GPL-2.0 许可证文本
├── licenses/ariang-LICENSE               # AriaNg MIT 许可证文本
├── ariang/
│   ├── manifest.json                     # 仅允许回环访问的嵌入式 WebExtension Manifest
│   ├── index.html                        # 已校验的 AriaNg 标准入口页面
│   ├── css/ 和 js/                       # 外置样式表和脚本
│   └── fonts/                            # 包含 Font Awesome WOFF2
└── chrome/content/
    ├── DownloadItAriaNg.sys.mjs         # 嵌入式 WebExtension 生命周期和 URL 访问
    ├── DownloadItService.sys.mjs        # 服务、进程和偏好管理
    ├── DownloadItAutoCapture.sys.mjs    # 版本化类型规则与内置接管保护
    ├── DownloadItPanelView.sys.mjs      # 原生工具栏面板行为
    ├── DownloadItContextMenu.sys.mjs    # Firefox 右键菜单
    ├── DownloadItDownloadDialog.sys.mjs # Firefox 原生下载弹窗集成
    ├── DownloadItDownloaders.sys.mjs    # provider 引用、JDownloader/ABDM/XDM/uGet/aria2 协议、自定义 schema 与模板
    ├── DownloadItMirrors.sys.mjs        # 镜像适配器注册表、设置校验与任务改写
    ├── DownloadItGitHubMirror.sys.mjs   # GitHub 文件 URL 适配器
    ├── DownloadItIDMBridge.sys.mjs      # Firefox 请求 hook 和回环响应桥
    ├── DownloadItIDMProtocol.sys.mjs    # IDM 本地端点和字节级消息解析
    ├── DownloadItXUL.sys.mjs             # 共享的 Firefox XUL 元素构造工具
    ├── DownloadItLinkCollectorActor.sys.mjs # 选区与页面链接提取 Actor
    ├── DownloadItLinks.sys.mjs           # 页面链接查询、分类、筛选与选择状态
    ├── DownloadItLocalization.sys.mjs   # Firefox Fluent 资源注册
    ├── DownloadItProtocol.sys.mjs       # 下载任务协议和校验
    ├── DownloadItUtils.sys.mjs           # 请求编码、域名和 Cookie 工具函数
    ├── icons/downloadit.svg              # 工具栏按钮和扩展图标
    ├── locales/
    │   ├── en-US/downloadit.ftl          # 英文 Fluent 消息
    │   └── zh-CN/downloadit.ftl          # 简体中文 Fluent 消息
    ├── panel.css                         # 原生工具栏面板样式
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

包内 Windows 与 Linux x86_64 Aria2Next `v2.5.5` 二进制来自 [AnInsomniacy/aria2-next](https://github.com/AnInsomniacy/aria2-next)，采用 GPL-2.0。XPI 的第三方说明中包含对应许可证文本和固定源码位置，生成的元数据记录两份资产经验证的文件大小和 SHA-256。

嵌入式 AriaNg `1.3.14` 标准资源包来自 [mayswind/AriaNg](https://github.com/mayswind/AriaNg)，采用 MIT。XPI 的第三方说明中包含对应许可证和固定源码位置；打包过程会校验上游压缩包、入口页面和所需外置资源。

英文版本请参阅 [README.md](README.md)。

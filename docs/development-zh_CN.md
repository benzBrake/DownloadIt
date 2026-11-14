# 开发说明

[English](development.md) · [项目介绍](../README-zh_CN.md)

## 构建与测试

在仓库根目录运行。Windows 构建使用 PowerShell 7：

```powershell
pwsh -ExecutionPolicy Bypass -File .\scripts\pack.ps1
```

Linux 构建使用 Bash、curl、zip/unzip 和 GNU core utilities；下载缺失的 FlashGot 桥接程序还需要 jq：

```bash
./scripts/pack.sh
```

两个脚本均生成适用于 Windows 和 Linux 的通用 `addon.xpi`。缺失的随包程序和前端资源会从上游发布下载，并在打包前校验。构建产物和下载的资源不纳入版本控制；依赖版本及校验信息由打包脚本维护。

测试使用 Node.js 18 及以上版本的内建测试运行器：

```sh
node --test tests/*.test.mjs
```

## 本地下载测试服务器

安装并配置好 WSLC 后，在 CMD 或 PowerShell 中运行：

```powershell
.\scripts\DownloadTestServer.cmd start
# 可选端口；不自动打开浏览器：
.\scripts\DownloadTestServer.cmd start -Port 8766 -NoOpen
# 停止指定实例：
.\scripts\DownloadTestServer.cmd stop -Port 8766
```

双击 `scripts/DownloadTestServer.cmd` 即可按默认设置启动；省略操作参数时默认为 `start`。CMD 入口优先使用 PowerShell 7，没有时使用 Windows PowerShell，仅在当前进程绕过执行策略。`.ps1` 入口也支持 `start`/`stop`、`-Port` 和 `-NoOpen`。停止不存在的实例会直接成功，不更改其他服务。

首次运行会拉取 `python:3.13-slim`。脚本仅以只读方式挂载 `scripts/download-test-server/`，后台启动容器并等待就绪，然后打开 `http://localhost:8765/`，端口只发布到 Windows 本机回环地址。匹配且健康的容器会被复用；同名容器不匹配或端口被占用时会报错，不替换其他服务。运行 `.\scripts\DownloadTestServer.cmd stop` 停止默认实例；容器停止后自动移除。修改服务代码后需停止并重新运行。

首页提供文本、有效 ZIP、302 跳转、32 MiB 普通及慢速下载，支持 HEAD 与单段 Range 断点续传。慢速接口约为 256 KiB/s。测试文件在内存中生成，不写入大型磁盘文件；可选中多个链接验证批量收集。

文件名编码样例包括简体中文 GB18030、繁体中文 Big5、日文 Shift_JIS 各两个，以及 ASCII 和 UTF-8 对照。URL 使用对应编码字节的百分号转义；编码下载响应为 `application/octet-stream` 和 `Content-Disposition: attachment`，不提供 `charset`、`filename` 或 `filename*`。开启 DownloadIt 的“检测 URL 文件名编码”，将弹窗中的名称与首页预期名称比较，必要时通过“文件名编码”下拉框切换候选。传统编码可能存在歧义，不保证自动猜测正确；载荷文本不决定文件名编码。独立测试页使用简体中文，与扩展运行时本地化分开。

使用同一 Python 镜像运行协议测试（也可用本机 Python 3.13 执行相同的 unittest 命令）：

```powershell
wslc run --rm --volume "${PWD}/scripts/download-test-server:/app:ro" --workdir /app python:3.13-slim python -B -m unittest -v test_server
```

## 代码组织

`addon/bootstrap.js` 负责扩展生命周期。`addon/chrome/content/` 下的模块实现下载器集成、链接收集、自动接管、Firefox 原生界面集成和设置。运行时界面文本使用 Firefox 内建 Fluent 系统，资源位于 `locales/{en-US,ja,zh-CN,zh-TW}/downloadit.ftl`，各语言保持相同的消息 ID。

实现使用 Firefox 内部 API，不使用 Loader 提供的工具函数。Loader 仅作为加载依赖。

## 版本与分发

`addon/install.rdf` 是 XPI 版本的唯一来源。DownloadIt 使用从 `2.0.0` 开始的独立版本线，与 FlashGot 及其桥接程序分开。版本使用三段数字：不兼容变更递增主版本，兼容功能递增次版本，兼容修复递增补丁版本，不得回退到已发布版本以下。

Nightly 工作流发布 `addon.xpi`，并从清单生成旧式更新清单 `update.rdf`。目前支持的 Loader 不执行自动更新，升级仍需手动安装。

安装和配置请参阅[使用文档](https://benzbrake.github.io/DownloadIt/zh-CN/)。随包组件的来源和许可证见[第三方声明](../addon/THIRD_PARTY_NOTICES.txt)。

编码检测依赖: jschardet 4.1.0 (0BSD), https://registry.npmjs.org/jschardet/-/jschardet-4.1.0.tgz

SHA-512 (base64): `ighRZ11mb6l4m+xSKoivuqNj44qkObODXsAnnkkfYcY4JfYRnEgAe/w1c3mbnJtTQmLtfebAUfXGsUGUJImexg==`.

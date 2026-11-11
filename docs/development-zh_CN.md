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

## 代码组织

`addon/bootstrap.js` 负责扩展生命周期。`addon/chrome/content/` 下的模块实现下载器集成、链接收集、自动接管、Firefox 原生界面集成和设置。运行时界面文本使用 Firefox 内建 Fluent 系统，资源位于 `locales/{en-US,ja,zh-CN,zh-TW}/downloadit.ftl`，各语言保持相同的消息 ID。

实现使用 Firefox 内部 API，不使用 Loader 提供的工具函数。Loader 仅作为加载依赖。

## 版本与分发

`addon/install.rdf` 是 XPI 版本的唯一来源。DownloadIt 使用从 `2.0.0` 开始的独立版本线，与 FlashGot 及其桥接程序分开。版本使用三段数字：不兼容变更递增主版本，兼容功能递增次版本，兼容修复递增补丁版本，不得回退到已发布版本以下。

Nightly 工作流发布 `addon.xpi`，并从清单生成旧式更新清单 `update.rdf`。目前支持的 Loader 不执行自动更新，升级仍需手动安装。

安装和配置请参阅[使用文档](https://benzbrake.github.io/DownloadIt/zh-CN/)。随包组件的来源和许可证见[第三方声明](../addon/THIRD_PARTY_NOTICES.txt)。

# oi-dsh-desktop

[English](./README.md)

这是一个面向 DeepSeek Harness 的开源 Electron 客户端。Harness Host 通过进程内
IPC 直接运行在 Electron 中，不执行 `dsh web`，也不开放 Harness HTTP/WebSocket
监听端口。

Harness 集成层由独立仓库
[`oi-dsh-desktop-bundle`](https://github.com/oioioioioioioioioioio/oi-dsh-desktop-bundle)
维护。本仓库固定使用带版本标签的 bundle，`npm install` 会自动下载并构建它。
官方 `@deepseek-ai/dsh` 同样直接从 npm 安装，本项目不会复制、修改或给官方包打补丁。

## 从 GitHub 源码运行

环境要求：

- Windows 10 或 Windows 11
- Node.js 22.19.0 或更高版本，并包含 npm
- Git

```powershell
git clone https://github.com/oioioioioioioioioioio/oi-dsh-desktop.git
cd oi-dsh-desktop
npm install
npm start
```

不需要安装 pnpm，也不需要单独克隆 bundle。Windows 用户还可以双击根目录的
`start.cmd`：首次运行时自动安装依赖，之后启动客户端。

## 客户端功能

- 自定义原生风格标题栏，并使用项目内置 logo。
- 支持添加多个项目目录并随时切换。
- 可显示或隐藏项目/文件侧栏，没有打开文件时默认展示项目目录。
- 在客户端内打开和编辑代码文件，并提供语法高亮。
- 在客户端内预览 Markdown 和编辑工作区文件。
- Windows 文件夹选择使用 Electron 原生目录对话框。
- 在 `DSH_HOME/profiles/oi-desktop` 下维护独立受管 Profile。

## 启动参数

```text
--profile <name>                 受管 Profile 名称，默认 oi-desktop
--dsh-home <path>                覆盖本次启动使用的 DSH_HOME
--devtools                       打开 Electron 开发者工具
--allow-unsupported-harness      跳过 Harness 版本兼容检查
```

通过 npm 或 Windows 启动器传递参数：

```powershell
npm start -- --devtools
.\start.cmd --devtools
```

## 开发与验证

```powershell
npm install
npm run check
```

`npm run check` 会执行类型检查、测试和生产构建。生成的 `lib/` 不提交到 Git。
`npm install` 会获取已经验证的 HTTPS bundle 归档，`npm start` 会在启动前重新构建
客户端。

## 许可证

Apache-2.0

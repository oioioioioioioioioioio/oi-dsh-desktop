# oi-dsh-desktop

面向 DeepSeek Harness 源码版的 Windows Electron 客户端安装器。

客户端直接扩展 Harness 源码并构建官方 Cordis 组合。Harness Host 运行在 Electron 主进程中，Renderer 通过进程内 IPC 连接，不执行 `dsh web`，不监听 `3080` 端口，也不是加载网页地址的 Electron 外壳。

## 环境要求

- Windows 10 或 Windows 11 x64
- Node.js 22.19.0 或更高版本，并包含 npm
- Git

安装器自带固定版本的 pnpm，不需要全局安装 pnpm。
安装器会直接检查桌面扩展能否干净应用到用户当前的 Harness 源码；不兼容时会在修改文件前停止并显示具体原因。

## 安装

先克隆官方 Harness，再把桌面端克隆到 Harness 根目录里面：

```powershell
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
git clone https://github.com/oioioioioioioioioioio/oi-dsh-desktop.git
cd oi-dsh-desktop
.\install.cmd
```

目录结构必须是：

```text
deepseek-harness\
├─ apps\
├─ packages\
├─ package.json
└─ oi-dsh-desktop\
   ├─ install.cmd
   └─ package.json
```

`install.cmd` 会自动完成：

1. 安装 `oi-dsh-desktop` 和 `oi-dsh-desktop-bundle`。
2. 将 Electron IPC、文件工作台和三栏布局扩展应用到 Harness 源码。
3. 使用固定版本 pnpm 安装 Harness 依赖。
4. 构建隔离的 Electron production runtime。
5. 生成可直接运行的 Windows 客户端。

生成的程序位于：

```text
deepseek-harness\dist\oi-dsh-desktop-win32-x64\oi-dsh-desktop.exe
```

安装完成后直接双击该 EXE。不要运行 `npx @deepseek-ai/dsh web`，后者只会启动官方浏览器界面。

## 客户端功能

- Electron 进程内 Harness Host 和固定 IPC 边界，不启动 HTTP/WebSocket 服务。
- 自定义原生风格标题栏、窗口拖动、缩放、最大化、最小化和关闭。
- 多项目工作区和会话切换。
- 可显示或隐藏的右侧项目目录与文件工作台。
- 右侧工作台宽度可拖动到窗口允许的任意宽度。
- 多标签文本与代码编辑，包含 CodeMirror 语法高亮、撤销、重做、刷新和保存。
- Markdown 源码、预览和分栏模式。
- Workspace 范围内的版本校验读写，避免覆盖外部编辑器的并发修改。
- Electron 原生文件夹选择和会话导出。

## 命令

在 `oi-dsh-desktop` 目录执行：

```powershell
npm run install:harness  # 只应用源码扩展
npm run build:exe        # 安装依赖、构建 runtime 并打包 EXE
npm run setup            # 完整安装，相当于上面两步
npm start                # 启动已经生成的 EXE
```

## 许可证

Apache-2.0。被扩展的 DeepSeek Harness 源码继续遵循其 MIT 许可证。

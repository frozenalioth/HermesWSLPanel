# Hermes WSL Panel

> Hermes CLI 的 Windows 桌面启动器 —— 通过 WSL 管理 Hermes AI 代理
Hermes WSL Panel 是 Hermes CLI 的 Windows 桌面启动器。通过 WSL 连接 Hermes AI 代理，提供 Profile 管理、会话浏览、常用指令一键复制、日志查看、主题切换等功能。首次启动自动检测 Hermes 路径，无需手动配置。适用于 Windows 10/11 + WSL 环境

## 功能

- 管理多个 Hermes Profile（切换、查看、新建、删除）
- 浏览历史会话列表（搜索、排序、展开消息、删除）
- 一键复制常用 Hermes 指令面板
- 启动 WSL 终端窗口
- 查看 Hermes 日志（agent / errors / gateway）
- Skills 浏览
- MCP 服务器管理
- 网络诊断工具
- 检查 Hermes 更新
- 三套主题：亮色 / 暗色 / 主题蓝

## 环境要求

- Windows 10 或 Windows 11
- [WSL](https://learn.microsoft.com/zh-cn/windows/wsl/install) 已安装并配置
- [Hermes CLI](https://hermes-agent.nousresearch.com) 已在 WSL 中安装

## 快速开始

### 下载编译好的版本

从 [Releases](https://github.com/你的用户名/HermesWSLPanel/releases) 页面下载最新的 `Hermes WSL Panel.exe`，双击运行即可。

### 首次启动

1. 第一次打开软件时，会自动弹出设置向导
2. 点击 **「检测 Hermes 位置」** 按钮
3. 程序会自动在 WSL 中找到 Hermes 的路径
4. 确认后保存，即可正常使用

> 如果自动检测失败，请确认 WSL 已启动且 Hermes 已正确安装。

### 从源码编译

```bash
# 1. 安装依赖
pip install flask pywebview pyinstaller

# 2. 编译
git clone https://github.com/你的用户名/HermesWSLPanel.git
cd HermesWSLPanel
build.bat

# 3. 输出文件在 dist/Hermes WSL Panel.exe
```

## 使用说明

### 启动 WSL
点击右上角 **「启动 WSL」** 按钮，弹出 WSL 终端窗口。

### 常用指令
点击菜单栏 **「指令」** 按钮，打开常用 Hermes 命令列表。点击 **「复制」** 按钮复制命令，到 WSL 终端中粘贴执行。

### 切换 Profile
在 Profile 条上点击不同的 Profile 标签切换。点击 **「管理」** 可查看详情或切换模型。

### 主题切换
菜单栏 **「视图」** 中可选亮色 / 暗色 / 主题色，或直接点击菜单栏右侧的快捷按钮。

## 项目结构

```
HermesWSLPanel/
├── main.py                 # Flask 后端
├── build.bat               # 编译脚本
├── Hermes Launchpad.spec   # PyInstaller 配置
├── .gitignore
├── frontend/
│   ├── index.html          # 主页面
│   ├── script.js           # 前端逻辑
│   └── style.css           # 样式
└── photos/                 # 图片资源
```

## 技术栈

- **后端**：Python + Flask
- **前端**：纯 HTML / CSS / JavaScript
- **桌面壳**：pywebview（使用系统 WebView）
- **编译**：PyInstaller
- **环境**：Windows + WSL2

## 作者

玉衡飞雪
联系方式：1205638494@qq.com

## 许可

[MIT](LICENSE)

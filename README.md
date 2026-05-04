# Syncthing Sync Web

基于 **Electron**、**React**、**TypeScript** 与 **Vite**（[electron-vite](https://electron-vite.org/)）的 Syncthing 管理客户端，通过 Syncthing **REST API** 管理本机或远程实例。

## 项目作用

- 连接 Syncthing（默认示例：`http://127.0.0.1:8384`）
- 认证方式：
  - **API 密钥**（浏览器与 Electron 均支持）
  - **Electron 本机**：对本地地址可使用无 API 密钥的 **CSRF 会话**
  - **Electron**：**GUI 用户名/密码**（主进程完成 Basic 与 CSRF）
- 功能概览：连接页、概览、本机状态、文件夹、设备、设置等
- 主进程发起 REST 请求，避免浏览器 CORS；连接信息在 Electron 中保存在用户数据目录的 `connection.json`，纯浏览器模式下使用 `localStorage`（且仅支持 API 密钥）

## 环境要求

- [Node.js](https://nodejs.org/)（建议 LTS）
- npm

## 安装依赖

```bash
npm install
```

## 编译（构建）

| 命令 | 说明 |
|------|------|
| `npm run build` | 使用 electron-vite 编译主进程、preload 与渲染进程，输出至 `out/` |
| `npm run package` | 先执行 `build`，再使用 electron-builder 生成安装包/便携包，输出至 `release/` |

`package.json` 中 electron-builder 大致目标：

- **Windows**：NSIS、portable
- **Linux**：AppImage、deb
- **macOS**：需在 macOS 上打包

## 运行

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式（脚本含 `NO_SANDBOX=1`，缓解 Linux 下沙箱问题） |
| `npm run preview` | 预览已构建产物 |
| `npm run dev:win` | Windows 下的开发入口（`set NO_SANDBOX=1`） |

日常开发使用 `npm run dev` 即可在 Electron 窗口中使用完整能力。

## 可选环境变量与说明

- **`SYNCWEB_DISABLE_GPU=1`**：关闭硬件加速；在无 GPU 或 WSL 等环境中可减少启动问题（主进程在检测到 WSL 时也会关闭硬件加速）。
- **Linux 以 root 运行**：主进程会自动追加 `no-sandbox`，否则 Electron 可能无法启动。

## 技术栈摘要

- Electron、electron-vite、electron-builder  
- React 18、react-router-dom  
- TypeScript、Vite  

## 许可证

以仓库内声明为准（若未单独声明，请向维护者确认）。

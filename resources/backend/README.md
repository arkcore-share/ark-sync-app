# 随应用打包的内嵌 Ark Sync 引擎

将**已编译好的** Ark Sync 同步引擎可执行文件放在本目录，应用启动时会自动拉起（若文件存在）：

| 平台 | 文件名 |
|------|--------|
| Windows | `arksync.exe` |
| Linux / macOS | `arksync`（需可执行权限） |

也可用环境变量 **`SYNCWEB_BUNDLED_EXE`** 指定文件名（在 `resources/backend/` 下）或 **绝对路径**。

- **数据目录**（与系统里单独安装的 Ark Sync 引擎实例隔离）：`%APPDATA%/sync-web/bundled-syncthing`（macOS/Linux 为应用 `userData` 下同名子目录）。
- **默认 GUI**：`http://127.0.0.1:8384`，连接页可填此地址并勾选本机免密钥。
- **关闭内嵌**：启动前设置环境变量 `SYNCWEB_DISABLE_BUNDLED_SYNCTHING=1`。
- **改端口**：设置 `SYNCWEB_BUNDLED_GUI_ADDRESS=127.0.0.1:8385`（不要带 `http://`）。
- **等待 GUI 就绪**：默认最多等 **20s**（`SYNCWEB_BUNDLED_START_WAIT_MS` 可改）。主进程在窗口出现前会尽量等端口可连，减少 `ECONNREFUSED`。
- **排障日志**：`%APPDATA%\sync-web\bundled-syncthing.log`（与 `userData` 目录一致），含启动命令、stderr。若仍失败，请确认 exe 与官方 Windows 版一样能在命令行执行，且 **`serve` 失败时会自动尝试旧参数** `-no-browser -gui-address=… -home …`。

实现见 `src/main/bundledSyncthing.ts`；进程 **`cwd` 为 exe 所在目录**，便于加载同目录 DLL。

**父进程 / 门禁**：由 Electron **主进程** `spawn` 起的 `arksync`，其直接父进程在开发模式下是 **`electron.exe`**，打包后一般是 **`arksync_client.exe`**。若后端仅允许 `arksync_client.exe`，开发调试会导致子进程拒绝启动、**8384 无监听**、界面报 `ECONNREFUSED`。主进程会向子进程传入 **`SYNCWEB_ELECTRON_MAIN_PID`**（父进程 PID）与 **`SYNCWEB_ELECTRON_PACKAGED`**（`1`=安装包，`0`=`npm run dev`），可在后端用于白名单或校验。

**注意**：二进制若很大，可用 Git LFS 或 CI 在打包前拷贝进本目录。

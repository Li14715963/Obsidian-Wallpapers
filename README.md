# Obsidian Wallpapers

Obsidian Wallpapers 是 Obsidian 桌面插件，可将图片或视频显示在工作区背景，并为笔记阅读区和侧栏添加可调节的玻璃外观。

本项目参考并改编自 [dsh-wallpaper-engine](https://github.com/elysia395/dsh-wallpaper-engine) 的壁纸视觉与本地媒体服务方案，针对 Obsidian 桌面端实现了独立插件。原项目的版权及 MIT 许可声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

| 项目 | 信息 |
| --- | --- |
| 版本 | 1.1.1 |
| 作者 | Lin |
| 插件 ID | `obsidian-wallpaper` |
| 最低 Obsidian 版本 | 1.13.0 |
| 平台 | Obsidian 桌面版 |

## 安装

### 需要安装的文件

本项目根目录中的 `obsidian-wallpaper` 文件夹就是可直接安装的完整插件包，包含以下三个运行文件，以及 `LICENSE` 和 `THIRD_PARTY_NOTICES.md`：

- `main.js`：插件运行代码
- `manifest.json`：插件名称、版本和兼容性信息
- `styles.css`：壁纸和玻璃外观样式

将整个 `obsidian-wallpaper` 文件夹复制到目标 Vault 的 `.obsidian/plugins/` 目录。安装后的完整路径为：

```text
<Vault 路径>/.obsidian/plugins/obsidian-wallpaper/
```

例如，安装到 Obsidian Sandbox 时：

```text
C:\Users\YourName\AppData\Roaming\obsidian\Obsidian Sandbox\.obsidian\plugins\obsidian-wallpaper\
```

如果 `plugins` 目录不存在，请先创建它。Windows 资源管理器可能隐藏 `.obsidian`；可以在地址栏直接输入路径，或打开“显示隐藏的项目”。不要把项目根目录、`src` 或 `node_modules` 复制到 `plugins` 中。Obsidian 首次加载插件后会在插件目录自动创建 `data.json` 保存设置。

### 在 Obsidian 中启用

1. 退出 Obsidian，或关闭目标 Vault。
2. 将项目根目录中的整个 `obsidian-wallpaper` 文件夹复制到 Vault 的 `.obsidian/plugins/` 目录。
3. 重新打开 Obsidian 和目标 Vault。
4. 打开 **设置 → 社区插件**，确认“受限模式”已关闭。
5. 在已安装插件中找到并启用 **Obsidian Wallpapers**。
6. 打开 Obsidian 设置中的 **Obsidian Wallpapers** 插件页开始配置。

如果插件没有出现在列表中，请确认三个文件直接位于 `.obsidian/plugins/obsidian-wallpaper/` 中，然后重启 Obsidian。

### 从源代码构建或部署

普通图片、视频和 Scene 实时播放不需要额外安装 Node.js。Scene 实时渲染失败时生成完整静态帧需要本机 Node.js 22 或更新版本。修改源代码后，如需重新生成插件并更新可复制的 `obsidian-wallpaper` 文件夹，在项目根目录运行：

```powershell
npm ci
npm run typecheck
npm run build
```

构建会在项目根目录生成 `main.js`，并自动把三个运行文件和许可文件同步到 `obsidian-wallpaper` 与 `release/obsidian-wallpaper` 安装文件夹。也可以在构建后使用脚本部署到现有 Vault：

```powershell
npm run deploy -- --vault "C:\Users\YourName\AppData\Roaming\obsidian\Obsidian Sandbox"
```

将路径替换为目标 Vault 的绝对路径。目标路径必须是已存在且含有 `.obsidian` 的 Vault。脚本复制三个运行文件和两个许可文件并通过 SHA-256 校验。已有 `data.json` 不会被覆盖。

## 使用

打开 Obsidian 设置中的 **Obsidian Wallpapers** 插件页。设置更改后会自动保存。插件初始处于停用状态，需要先打开 **启用壁纸**。

### 使用图片或视频

1. 在“壁纸”区域打开 **启用壁纸**。
2. 在 **壁纸来源** 输入 Vault 内的相对路径，例如 `Assets/wallpaper.jpg`。也可以从输入框的媒体建议中选择文件。
3. 或者输入 `http://` / `https://` 媒体地址。

支持的图片格式：`png`、`jpg`、`jpeg`、`gif`、`webp`、`avif`、`bmp`、`svg`。支持的视频格式：`mp4`、`webm`、`m4v`、`ogv`。普通来源只接受 Vault 内路径或 HTTP(S) 地址，不接受任意本机磁盘路径。视频会静音循环播放；**窗口隐藏时暂停**默认开启。

### 只使用玻璃外观

保持 **壁纸来源** 和 **轮播文件夹** 为空，并打开 **启用壁纸**。插件会在当前主题背景上应用玻璃外观，不显示额外壁纸。

### 设置文件夹轮播

1. 在 Vault 中准备一个存放图片或视频的文件夹。
2. 将 Vault 相对路径填入 **轮播文件夹**。
3. 设置 **轮播间隔（分钟）**，默认是 30 分钟。
4. 打开 **启用壁纸**。

插件会递归读取该文件夹及子文件夹中的支持格式，并按文件路径排序轮播。设置轮播文件夹后，它优先于 **壁纸来源**。想立即切换时，在命令面板运行 **Obsidian Wallpapers: 轮播：换下一张**。

### 调整外观

- **填充方式**：裁剪铺满、完整显示、模糊背景补边或拉伸铺满。
- **玻璃外观**：调整模糊、透明度、颜色、暗化遮罩、边框和笔记阅读面的不透明度。
- **侧栏玻璃**：单独设置侧栏玻璃效果、模糊、透明度和颜色。
- **壁纸画面**：调整壁纸模糊、亮度、对比度、饱和度、视频播放速率和水平镜像。
- **毛玻璃模糊**：如果开启后 Obsidian 窗口无法拖动，请关闭该选项，改用静态半透明底。

也可以在命令面板运行 **Obsidian Wallpapers: 启用/停用壁纸**，快速切换效果。停用后插件会移除壁纸层并恢复原主题外观。

### 可选：Wallpaper Engine

Wallpaper Engine 集成默认关闭，仅适用于安装了 Steam 和 Wallpaper Engine 的 Windows 电脑：

1. 在设置页的 **Wallpaper Engine** 区域打开集成开关。
2. 点击 **扫描**。
3. 找到项目后点击对应的 **使用** 按钮。

视频项目可以播放。Scene 项目默认通过随 `main.js` 离线打包的 WebWallGL 实时渲染，静音、30 fps；首帧 30 秒内未出现或运行中失败时，后台调用本机 Node.js 生成完整静态场景帧。加载期间保留预览图。可在设置中选“实时／静态／预览”与 15／30／60 fps。静态帧缓存位于 Windows `%LOCALAPPDATA%\Obsidian-Wallpapers\scene-cache`，不写入 Vault；缓存按壁纸文件时间、尺寸及渲染器版本失效。网页项目可能因本地相对资源加载方式而显示不完整。没有安装 Steam 和 Wallpaper Engine 时，可以忽略此功能。

## 更新与卸载

- **更新**：用新版的 `main.js`、`manifest.json` 和 `styles.css` 覆盖插件目录中的同名文件，然后重新加载 Obsidian 或重启 Vault。保留现有 `data.json` 可保留设置。
- **设置位置**：`<Vault>/.obsidian/plugins/obsidian-wallpaper/data.json`。删除此文件会重置设置。
- **卸载**：先在社区插件设置中停用 Obsidian Wallpapers，关闭 Obsidian，再删除 `obsidian-wallpaper` 文件夹。想保留设置时，先备份 `data.json`。

## 常见问题与兼容性

**插件没有出现在列表中**：确认目录为 `.obsidian/plugins/obsidian-wallpaper/`，三个文件直接位于其中；确认 Obsidian 是桌面版且版本不低于 1.13.0，并关闭受限模式，然后重启 Obsidian。

**启用后看不到壁纸**：确认已打开 **启用壁纸**；来源路径从 Vault 根目录开始填写，文件扩展名受支持。轮播时，确认文件夹路径有效且其中有支持的媒体文件。

**Wallpaper Engine 扫描不到项目**：确认本机已安装 Steam 和 Wallpaper Engine，打开集成后再点 **扫描**。扫描依赖 Windows 上的 Steam 安装位置。

**窗口无法拖动**：关闭 **毛玻璃模糊**。

本插件使用 ID `obsidian-wallpaper`，安装目录与此 ID 一致。Scene 实时渲染使用本机回环来源读取已扫描项目文件，URL 使用随机令牌；静态渲染在隐藏的外部 Node.js 子进程中运行。若两种渲染都失败，插件保留预览图并报告错误。

本项目采用 [MIT 许可证](LICENSE)。

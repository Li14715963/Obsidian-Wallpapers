import { App, Notice, Modal, PluginSettingTab, Setting, TFile } from "obsidian";
import { AbstractInputSuggest } from "obsidian";
import type NexusWallpaperPlugin from "./main";
import { listVaultMedia } from "./sources";
import { DEFAULT_SETTINGS } from "./types";

/** Suggests vault media files for the source input. */
class MediaFileSuggest extends AbstractInputSuggest<TFile> {
  constructor(
    app: App,
    inputEl: HTMLInputElement,
    private readonly onPick: (path: string) => void
  ) {
    super(app, inputEl);
  }

  protected getSuggestions(query: string): TFile[] {
    const q = query.trim().toLowerCase();
    const files = listVaultMedia(this.app);
    if (!q) return files.slice(0, 50);
    return files.filter((f) => f.path.toLowerCase().includes(q)).slice(0, 50);
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.setText(file.path);
  }

  selectSuggestion(file: TFile): void {
    this.setValue(file.path);
    this.onPick(file.path);
    this.close();
  }
}

/** Minimal confirmation dialog (Obsidian has no built-in confirm). */
class ConfirmModal extends Modal {
  constructor(
    app: App,
    private readonly title: string,
    private readonly message: string,
    private readonly onConfirm: () => Promise<void> | void
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.title);
    this.contentEl.createEl("p", { text: this.message });
    new Setting(this.contentEl)
      .addButton((b) =>
        b.setButtonText("确定").setCta().onClick(() => {
          this.close();
          void this.onConfirm();
        })
      )
      .addButton((b) => b.setButtonText("取消").onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class NexusWallpaperSettingTab extends PluginSettingTab {
  private readonly plugin: NexusWallpaperPlugin;

  constructor(app: App, plugin: NexusWallpaperPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const s = this.plugin.settings;

    new Setting(containerEl).setName("壁纸").setHeading();

    this.toggle("启用壁纸", "关闭后立即移除壁纸层并恢复原主题外观", () => s.enabled, async (v) => {
      s.enabled = v;
    });

    this.text("壁纸来源", "vault 内媒体文件路径（mp4/webm/m4v/ogv/gif/png/jpg/webp…）或 http(s) URL；留空时仅应用玻璃效果", () => s.source, async (v) => {
      s.source = v;
    }, true);

    this.text("轮播文件夹", "vault 内文件夹路径；设置后按其中媒体轮播并忽略上方单源", () => s.playlistFolder, async (v) => {
      s.playlistFolder = v;
      this.plugin.resetRotation();
    }, false);

    this.slider("轮播间隔（分钟）", "轮播文件夹内切换壁纸的间隔", 1, 480, 1, () => s.rotationInterval, async (v) => {
      s.rotationInterval = v;
    });

    new Setting(containerEl).setName("玻璃外观").setHeading();

    this.toggle("毛玻璃模糊", "backdrop-filter 磨砂效果；若开启时窗口无法拖动，请关闭此项（改用静态半透明底）", () => s.glassBlurEnabled, async (v) => {
      s.glassBlurEnabled = v;
    });

    this.dropdown("填充方式", "壁纸在窗口内的呈现方式", () => s.objectFit, async (v) => {
      s.objectFit = v as typeof s.objectFit;
    }, [
      ["cover", "裁剪铺满（cover）"],
      ["contain", "完整显示，留黑边（contain）"],
      ["contain-blur", "完整显示，模糊背景补边（竖屏壁纸推荐）"],
      ["fill", "拉伸铺满（fill）"]
    ]);

    this.slider("播放速率", "视频壁纸播放速率", 0.25, 4, 0.25, () => s.playbackRate, async (v) => {
      s.playbackRate = v;
    });

    this.toggle("水平镜像", "翻转壁纸画面", () => s.flip, async (v) => {
      s.flip = v;
    });

    this.slider("玻璃模糊", "面板玻璃的磨砂模糊半径（px）", 0, 60, 1, () => s.blur, async (v) => {
      s.blur = v;
    });

    this.slider("玻璃透明度", "值越大玻璃越透明（dsh 同款映射）", 0, 60, 5, () => s.glassAlpha, async (v) => {
      s.glassAlpha = v;
    });

    this.text("玻璃颜色", "十六进制颜色；留空时深色模式 #0d1524、浅色模式 #ffffff", () => s.glassColor, async (v) => {
      s.glassColor = v;
    }, false);

    this.slider("暗化遮罩", "壁纸上的黑色遮罩强度（%）", 0, 100, 5, () => s.scrim, async (v) => {
      s.scrim = v;
    });

    this.slider("边框强度", "玻璃面高光发丝线强度（%）", 0, 100, 5, () => s.borderAlpha, async (v) => {
      s.borderAlpha = v;
    });

    this.slider("内容面不透明度", "笔记阅读面玻璃底色浓度（%）", 0, 100, 5, () => s.contentAlpha, async (v) => {
      s.contentAlpha = v;
    });

    this.text("主题色", "十六进制颜色；留空时跟随 Obsidian 主题色", () => s.accent, async (v) => {
      s.accent = v;
    }, false);

    new Setting(containerEl).setName("侧栏玻璃").setHeading();

    this.toggle("侧栏玻璃", "左右侧栏应用独立的液态玻璃配方", () => s.sidebarGlass, async (v) => {
      s.sidebarGlass = v;
    });

    this.slider("侧栏模糊", "侧栏玻璃模糊半径（px）", 0, 60, 1, () => s.sidebarBlur, async (v) => {
      s.sidebarBlur = v;
    });

    this.slider("侧栏透明度", "值越大侧栏越透明（0-200，dsh 同款映射）", 0, 200, 10, () => s.sidebarAlpha, async (v) => {
      s.sidebarAlpha = v;
    });

    this.text("侧栏颜色", "十六进制颜色", () => s.sidebarColor, async (v) => {
      s.sidebarColor = v;
    }, false);

    new Setting(containerEl).setName("壁纸画面").setHeading();

    this.slider("壁纸模糊", "对壁纸本身施加的模糊（px）", 0, 60, 1, () => s.wallpaperBlur, async (v) => {
      s.wallpaperBlur = v;
    });

    this.slider("壁纸亮度", "壁纸亮度（%）", 0, 200, 5, () => s.wallpaperBrightness, async (v) => {
      s.wallpaperBrightness = v;
    });

    this.slider("壁纸对比度", "壁纸对比度（%）", 0, 200, 5, () => s.wallpaperContrast, async (v) => {
      s.wallpaperContrast = v;
    });

    this.slider("壁纸饱和度", "壁纸饱和度（%）", 0, 200, 5, () => s.wallpaperSaturate, async (v) => {
      s.wallpaperSaturate = v;
    });

    new Setting(containerEl).setName("行为").setHeading();

    this.toggle("窗口隐藏时暂停", "最小化或切走时暂停视频壁纸", () => s.pauseOnHidden, async (v) => {
      s.pauseOnHidden = v;
    });

    new Setting(containerEl).setName("Wallpaper Engine").setHeading();

    new Setting(containerEl)
      .setName("启用 Wallpaper Engine 集成")
      .setDesc("扫描本机 Steam 上的 Wallpaper Engine 壁纸并在下方选择；关闭时不扫描、行为与 v1 一致")
      .addToggle((t) =>
        t.setValue(s.weEnabled).onChange(async (v) => {
          s.weEnabled = v;
          await this.plugin.saveSettingsAndApply();
          if (v && s.weCache.length === 0) await this.plugin.scanWe();
          this.display();
        })
      );

    const count = s.weCache.length;
    new Setting(containerEl)
      .setName("重新扫描")
      .setDesc(
        count
          ? `上次扫描到 ${count} 个壁纸（${s.weScannedAt ? s.weScannedAt.slice(0, 19).replace("T", " ") : "时间未知"}）`
          : "尚未扫描到壁纸；需要本机安装 Steam 与 Wallpaper Engine"
      )
      .addButton((b) =>
        b.setButtonText("扫描").onClick(async () => {
          b.setDisabled(true).setButtonText("扫描中…");
          const n = await this.plugin.scanWe();
          b.setDisabled(false).setButtonText("扫描");
          new Notice(`Nexus Wallpaper: 找到 ${n} 个 Wallpaper Engine 壁纸`);
          this.display();
        })
      );

    if (s.weEnabled) {
      const typeLabels: Record<string, string> = {
        video: "视频壁纸",
        scene: "场景壁纸（静态预览帧，画质受预览图限制）",
        web: "网页壁纸（部分本地资源可能不完整）"
      };
      for (const item of s.weCache) {
        const source = `we://${item.id}`;
        const active = s.source === source;
        const desc =
          item.type === "scene" && item.previewSize
            ? `${typeLabels.scene} ${item.previewSize}`
            : (typeLabels[item.type] ?? item.type);
        new Setting(containerEl)
          .setName(item.title)
          .setDesc(desc)
          .addButton((b) => {
            if (active) {
              b.setButtonText("✓ 使用中").setDisabled(true);
              return;
            }
            b.setButtonText("使用").onClick(async () => {
              s.source = source;
              await this.persist();
              this.display();
            });
          });
      }
    }

    new Setting(containerEl)
      .setName("恢复默认参数")
      .setDesc("全部玻璃外观、壁纸画面与行为参数恢复默认；壁纸来源、轮播文件夹与启用状态保留不变")
      .addButton((b) =>
        b.setButtonText("重置").setWarning().onClick(() => {
          new ConfirmModal(
            this.app,
            "恢复默认参数",
            "玻璃外观、壁纸画面与行为参数将恢复为默认值；壁纸来源、轮播文件夹与启用状态保留。确定重置？",
            async () => {
              const { enabled, source, playlistFolder } = this.plugin.settings;
              this.plugin.settings = { ...DEFAULT_SETTINGS, enabled, source, playlistFolder };
              await this.plugin.saveSettingsAndApply();
              this.display();
            }
          ).open();
        })
      );
  }

  private async persist(): Promise<void> {
    await this.plugin.saveSettingsAndApply();
  }

  private toggle(
    name: string,
    desc: string,
    get: () => boolean,
    set: (v: boolean) => Promise<void> | void
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addToggle((t) =>
        t.setValue(get()).onChange(async (v) => {
          await set(v);
          await this.persist();
        })
      );
  }

  private slider(
    name: string,
    desc: string,
    min: number,
    max: number,
    step: number,
    get: () => number,
    set: (v: number) => Promise<void> | void
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addSlider((sl) =>
        sl
          .setLimits(min, max, step)
          .setValue(get())
          .setDynamicTooltip()
          .onChange(async (v) => {
            await set(v);
            await this.persist();
          })
      );
  }

  private text(
    name: string,
    desc: string,
    get: () => string,
    set: (v: string) => Promise<void> | void,
    suggestMedia: boolean
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addText((t) => {
        t.setValue(get()).onChange(async (v) => {
          await set(v.trim());
          await this.persist();
        });
        if (suggestMedia) {
          new MediaFileSuggest(this.app, t.inputEl, async (picked) => {
            t.setValue(picked);
            await set(picked);
            await this.persist();
          });
        }
      });
  }

  private dropdown(
    name: string,
    desc: string,
    get: () => string,
    set: (v: string) => Promise<void> | void,
    options: Array<[string, string]>
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addDropdown((d) => {
        for (const [value, label] of options) d.addOption(value, label);
        d.setValue(get()).onChange(async (v) => {
          await set(v);
          await this.persist();
        });
      });
  }
}

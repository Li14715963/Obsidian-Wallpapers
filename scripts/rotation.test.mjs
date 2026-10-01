import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { transform } from "esbuild";

const compile = async (file) => (await transform(readFileSync(file, "utf8"), {
  loader: "ts", format: "cjs", target: "es2022"
})).code;
const typesCode = await compile("src/types.ts");
const mainCode = await compile("src/main.ts");
const clone = (value) => JSON.parse(JSON.stringify(value));
const flush = () => new Promise((resolve) => setImmediate(resolve));
const items = [
  { id: "a", type: "video", mediaPath: "a.mp4" },
  { id: "b", type: "scene", scenePkgPath: "b.pkg", previewPath: "b.jpg" },
  { id: "c", type: "web", mediaPath: "c.html" }
];

async function fixture(overrides = {}) {
  const timers = new Map();
  let timerId = 0;
  const window = {
    setInterval(callback, milliseconds) {
      const id = ++timerId;
      timers.set(id, { callback, milliseconds });
      return id;
    },
    clearInterval(id) { timers.delete(id); }
  };
  const typesModule = { exports: {} };
  vm.runInNewContext(typesCode, { module: typesModule, exports: typesModule.exports });
  const types = typesModule.exports;
  class Plugin {
    commands = [];
    writes = [];
    async loadData() { return this.data; }
    async saveData(settings) {
      this.data = clone(settings);
      this.writes.push(this.data);
    }
    addCommand(command) { this.commands.push(command); }
    addSettingTab() {}
    registerDomEvent() {}
    registerEvent() {}
  }
  class WallpaperLayer {
    syncs = [];
    sync(settings, source) { this.syncs.push(source); }
    destroy() { this.destroyed = true; }
    handleVisibility() {}
  }
  class Stoppable { stop() {} }
  const mocks = {
    obsidian: { Plugin, Notice: class {} },
    "./types": types,
    "./sources": {
      isWeSource: (source) => source.trim().startsWith("we://"),
      weIdOf: (source) => source.trim().slice(5),
      listFolderMedia: (app) => app.files,
      resolveSource: (app, source) => ({ key: source }),
      resolveWeItem: async (id, cache) => cache.some((item) => item.id === id) ? { key: `we://${id}` } : null
    },
    "./we-scan": { scanWallpapers: () => overrides.weCache ?? items },
    "./we-server": { MediaServer: Stoppable },
    "./layer": { WallpaperLayer },
    "./settings": { ObsidianWallpaperSettingTab: class { updateWeSelection() {} } },
    "./scene-static": { StaticSceneRenderer: Stoppable }
  };
  const mainModule = { exports: {} };
  vm.runInNewContext(mainCode, {
    module: mainModule, exports: mainModule.exports, window, document: {},
    require(name) {
      assert.ok(name in mocks, `Unexpected import: ${name}`);
      return mocks[name];
    }
  });
  const plugin = new mainModule.exports.default();
  plugin.data = {
    enabled: true, source: "we://b", weEnabled: true,
    weRotationEnabled: true, weRotationInterval: 5, weCache: items,
    ...overrides
  };
  plugin.app = {
    files: [{ path: "wallpapers/1.jpg" }, { path: "wallpapers/2.mp4" }],
    workspace: { on() {}, onLayoutReady(callback) { this.ready = callback; } }
  };
  await plugin.onload();
  plugin.app.workspace.ready();
  await flush();
  return {
    plugin, timers,
    async tick() {
      assert.equal(timers.size, 1);
      [...timers.values()][0].callback();
      await flush();
    },
    async next() {
      await plugin.commands.find((command) => command.id === "next-wallpaper").callback();
    }
  };
}

test("old settings retain their wallpaper without starting automatic switching", async () => {
  const { plugin, timers } = await fixture({ weRotationEnabled: undefined, weRotationInterval: undefined });
  assert.equal(plugin.settings.weRotationEnabled, false);
  assert.equal(plugin.settings.weRotationInterval, 30);
  assert.equal(plugin.settings.source, "we://b");
  assert.equal(timers.size, 0);
});

test("the configured timer rotates mixed project types, wraps and persists the current item", async () => {
  const { plugin, timers, tick } = await fixture();
  assert.equal([...timers.values()][0].milliseconds, 5 * 60_000);
  for (const source of ["we://c", "we://a", "we://b"]) {
    await tick();
    assert.equal(plugin.settings.source, source);
    assert.equal(plugin.wallpaper.syncs.at(-1).key, source);
    assert.equal(plugin.data.source, source);
  }
  const restarted = await fixture(plugin.data);
  assert.equal(restarted.plugin.wallpaper.syncs.at(-1).key, "we://b");
  assert.equal(restarted.timers.size, 1);
});

test("changing the interval replaces the timer without changing the selected wallpaper", async () => {
  const { plugin, timers } = await fixture();
  const previousId = [...timers.keys()][0];
  plugin.settings.weRotationInterval = 12;
  await plugin.saveSettingsAndApply();
  await flush();
  assert.equal(timers.size, 1);
  assert.ok(!timers.has(previousId));
  assert.equal([...timers.values()][0].milliseconds, 12 * 60_000);
  assert.equal(plugin.settings.source, "we://b");
});

test("disabling automatic switching, integration or wallpaper stops the timer immediately", async () => {
  for (const key of ["weRotationEnabled", "weEnabled", "enabled"]) {
    const { plugin, timers } = await fixture();
    plugin.settings[key] = false;
    await plugin.saveSettingsAndApply();
    assert.equal(timers.size, 0, key);
    assert.equal(plugin.settings.source, "we://b");
  }
});

test("a Vault playlist keeps its own interval and never replaces the Wallpaper Engine selection", async () => {
  const { plugin, timers, tick } = await fixture({ playlistFolder: "wallpapers", rotationInterval: 17 });
  assert.equal([...timers.values()][0].milliseconds, 17 * 60_000);
  assert.equal(plugin.wallpaper.syncs.at(-1).key, "wallpapers/1.jpg");
  await tick();
  assert.equal(plugin.wallpaper.syncs.at(-1).key, "wallpapers/2.mp4");
  assert.equal(plugin.settings.source, "we://b");
  assert.equal(plugin.writes.length, 0);
});

test("empty or single-item scans and ordinary media do not start a Wallpaper Engine timer", async () => {
  for (const overrides of [{ weCache: [] }, { weCache: [items[0]], source: "we://a" }, { source: "photo.jpg" }]) {
    const { plugin, timers, next } = await fixture(overrides);
    const source = plugin.settings.source;
    const writeCount = plugin.writes.length;
    assert.equal(timers.size, 0);
    await next();
    assert.equal(plugin.settings.source, source);
    assert.equal(plugin.writes.length, writeCount);
  }
});

test("manual next works with automatic switching off, and a removed current item resumes at the first item", async () => {
  const manual = await fixture({ weRotationEnabled: false });
  await manual.next();
  assert.equal(manual.plugin.settings.source, "we://c");
  assert.equal(manual.timers.size, 0);
  const missing = await fixture({ source: "we://removed" });
  await missing.tick();
  assert.equal(missing.plugin.settings.source, "we://a");
});

test("unloading clears the timer and pending saves cannot rebuild the wallpaper afterward", async () => {
  const { plugin, timers } = await fixture();
  let release;
  plugin.saveData = () => new Promise((resolve) => { release = resolve; });
  const pending = plugin.advanceRotation();
  const syncCount = plugin.wallpaper.syncs.length;
  plugin.onunload();
  assert.equal(timers.size, 0);
  assert.equal(plugin.wallpaper.destroyed, true);
  release();
  await pending;
  assert.equal(timers.size, 0);
  assert.equal(plugin.wallpaper.syncs.length, syncCount);
});

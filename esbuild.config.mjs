import esbuild from 'esbuild';
import builtins from 'builtin-modules';
import fs from 'node:fs';
import path from 'node:path';

const production = process.argv[2] === 'production';
const vendor = path.resolve('vendor/dsh/webwallgl');
const cpu = await esbuild.build({
  entryPoints: ['src/scene-frame-runner.mjs'], bundle: true, platform: 'node',
  format: 'cjs', target: 'node22', write: false, minify: production,
  logLevel: 'silent'
});
const assets = {
  html: fs.readFileSync(path.join(vendor, 'index.html'), 'utf8'),
  renderer: fs.readFileSync(path.join(vendor, 'assets/renderer-BlHxh0Fx.js'), 'utf8'),
  polyfill: fs.readFileSync(path.join(vendor, 'assets/modulepreload-polyfill-B5Qt9EMX.js'), 'utf8'),
  cpu: cpu.outputFiles[0].text
};
const embeddedAssets = {
  name: 'embedded-scene-assets',
  setup(build) {
    build.onResolve({ filter: /^scene-assets$/ }, () => ({ path: 'scene-assets', namespace: 'embedded' }));
    build.onLoad({ filter: /.*/, namespace: 'embedded' }, () => ({
      contents: `export default ${JSON.stringify(assets)};`, loader: 'js'
    }));
  }
};

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  plugins: [embeddedAssets],
  external: ['obsidian', 'electron', ...builtins],
  format: 'cjs',
  target: 'es2022',
  logLevel: 'info',
  sourcemap: production ? false : 'inline',
  minify: production,
  outfile: 'main.js'
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}

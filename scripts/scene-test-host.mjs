import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const outputDir = process.argv[2];
if (!outputDir || !path.isAbsolute(outputDir)) throw new Error('Pass an absolute output directory');
fs.mkdirSync(outputDir, { recursive: true });
const embedded = Object.fromEntries([
  ['html', 'index.html'], ['renderer', 'assets/renderer-BlHxh0Fx.js'],
  ['polyfill', 'assets/modulepreload-polyfill-B5Qt9EMX.js']
].map(([key, file]) => [key, fs.readFileSync(`vendor/dsh/webwallgl/${file}`, 'utf8')]));
const bundle = await esbuild.build({
  stdin: { contents: `export { MediaServer } from './src/we-server'; export { scanWallpapers } from './src/we-scan';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false,
  plugins: [{ name: 'test-assets', setup(build) {
    build.onResolve({ filter: /^scene-assets$/ }, () => ({ path: 'assets', namespace: 'test' }));
    build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `export default ${JSON.stringify(embedded)}`, loader: 'js' }));
  }}]
});
const filename = path.join(outputDir, 'scene-test-host.cjs');
fs.writeFileSync(filename, bundle.outputFiles[0].text);
const { MediaServer, scanWallpapers } = createRequire(import.meta.url)(filename);
const server = new MediaServer();
const items = scanWallpapers().filter(x => x.type === 'scene');
const results = [];
for (const item of items) results.push({ ...item, url: await server.sceneUrlFor(item), bytes: fs.statSync(item.scenePkgPath).size });
fs.writeFileSync(path.join(outputDir, 'scene-projects.json'), JSON.stringify(results, null, 2));
const probe = path.join(outputDir, 'range-probe.bin');
fs.writeFileSync(probe, Buffer.from('0123456789'));
const url = await server.urlFor(probe);
const tests = [];
for (const [range, status, body] of [['bytes=2-4',206,'234'], ['bytes=-3',206,'789'], ['bytes=7-',206,'789'], ['bytes=99-',416,''], ['bytes=4-2',416,''], ['bytes=0-1,3-4',416,'']]) {
  const response = await fetch(url, { headers: { Range: range } });
  const actual = await response.text();
  if (response.status !== status || actual !== body) throw new Error(`Range failed: ${range}`);
  tests.push({ range, status });
}
const head = await fetch(url, { method: 'HEAD' });
if (head.headers.get('content-length') !== '10' || (await head.text()) !== '') throw new Error('HEAD failed');
const base = new URL(results[0].url).searchParams.get('mediaBase');
const token = new URL(results[0].url).searchParams.get('src');
for (const rel of ['%2e%2e%2fproject.json', 'C%3a%2fWindows%2fwin.ini', '%5c%5cserver%5cshare']) {
  const response = await fetch(`${base}/${token}/${rel}`);
  if (response.status !== 403) throw new Error(`Boundary failed: ${rel}: ${response.status}`);
}
if ((await fetch(`${base}/forged/project.json`)).status !== 404) throw new Error('Forged token accepted');
const fixtureDir = path.join(outputDir, 'boundary-fixture');
fs.mkdirSync(fixtureDir, { recursive: true });
fs.copyFileSync(results.find(x=>x.id==='2476371899').scenePkgPath, path.join(fixtureDir,'scene.pkg'));
fs.writeFileSync(path.join(fixtureDir,'project.json'), '{}');
const link = path.join(fixtureDir,'escape');
if (!fs.existsSync(link)) fs.symlinkSync(outputDir,link,'junction');
const fixtureUrl = new URL(await server.sceneUrlFor({scenePkgPath:path.join(fixtureDir,'scene.pkg')}));
const escaped = await fetch(`${fixtureUrl.searchParams.get('mediaBase')}/${fixtureUrl.searchParams.get('src')}/escape/range-probe.bin`);
if (escaped.status !== 403) throw new Error('Junction escape accepted');
fs.writeFileSync(path.join(outputDir, 'resource-tests.json'), JSON.stringify({ range: tests, head: 'passed', boundary: 'passed', junctionEscape:'passed', forgedToken: 'passed' }, null, 2));
console.log(`READY ${items.length} scenes; range and boundary checks passed; ${outputDir}`);
if (process.argv.includes('--once')) server.stop();
process.on('SIGINT', () => { server.stop(); process.exit(); });
process.on('SIGTERM', () => { server.stop(); process.exit(); });

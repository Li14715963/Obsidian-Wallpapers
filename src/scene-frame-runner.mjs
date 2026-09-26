import fs from 'node:fs';
import { SceneRenderer, Canvas, encodePng } from '../vendor/dsh/scene-renderer.js';

const [src, output, widthText, heightText, weAssetsDir] = process.argv.slice(2);
try {
  const width = Number(widthText), height = Number(heightText);
  if (!src || !output || !Number.isInteger(width) || !Number.isInteger(height) ||
      width < 1 || height < 1 || width > 3840 || height > 2160) throw new Error('invalid frame job');
  const renderer = new SceneRenderer(src, {
    width, height, time: 1, weAssetsDir: weAssetsDir || undefined, log: () => {}
  });
  const projection = renderer.scene.general?.orthogonalprojection;
  if (Number(projection?.width) > 0 && Number(projection?.height) > 0) {
    const scale = Math.min(width / projection.width, height / projection.height);
    renderer.W = Math.max(1, Math.round(projection.width * scale));
    renderer.H = Math.max(1, Math.round(projection.height * scale));
    renderer.canvas = new Canvas(renderer.W, renderer.H);
  }
  const frame = renderer.render();
  const pixels = frame.data;
  const cc = String(renderer.scene.general?.clearcolor || '0 0 0').split(/\s+/).map(x => Number(x) * 255);
  let visible = 0;
  for (let i = 0; i < pixels.length; i += 32) {
    if (Math.abs(pixels[i] - cc[0]) > 24 || Math.abs(pixels[i + 1] - cc[1]) > 24 || Math.abs(pixels[i + 2] - cc[2]) > 24) visible++;
  }
  if (visible < Math.ceil(pixels.length / 32) * 0.03) throw new Error('rendered frame is incomplete or blank');
  fs.writeFileSync(output, encodePng(frame.w, frame.h, pixels));
  process.stdout.write(JSON.stringify({ width: frame.w, height: frame.h, visible }));
} catch (error) {
  process.stderr.write(String(error?.stack || error));
  process.exitCode = 1;
}

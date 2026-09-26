"""Verify installed scenes in an isolated Chromium process. No Vault files are changed."""
import argparse
import hashlib
import json
import subprocess
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('output_dir', type=Path)
parser.add_argument('--runner', type=Path, required=True)
parser.add_argument('--node', default='node')
parser.add_argument('--browser', required=True)
args = parser.parse_args()
items = json.loads((args.output_dir / 'scene-projects.json').read_text(encoding='utf-8'))
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.browser, headless=True,
        args=['--enable-webgl', '--ignore-gpu-blocklist'])
    try:
        for item in items:
            page = browser.new_page(viewport={'width': 1280, 'height': 720})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            result = {'id': item['id'], 'bytes': item['bytes'], 'status': 'failed', 'errors': errors}
            started = time.monotonic()
            try:
                page.goto(item['url'] + '&sceneFps=30&fit=cover', wait_until='networkidle', timeout=30000)
                page.wait_for_function("window.__wpStats?.frame().running && window.__wpStats.frame().fps > 0", timeout=30000)
                page.wait_for_timeout(1000)
                first = page.screenshot(path=str(args.output_dir / (item['id'] + '-live.png')))
                page.wait_for_timeout(1000)
                second = page.screenshot()
                stats = page.evaluate('window.__wpStats.frame()')
                result.update(status='live', fps=stats['fps'], changing=hashlib.sha256(first).digest() != hashlib.sha256(second).digest())
                page.evaluate('window.__wp.pause()')
                page.wait_for_timeout(700)
                result['pausePassed'] = not page.evaluate('window.__wpStats.frame().running')
                page.evaluate('window.__wp.resume()')
                page.wait_for_function('window.__wpStats.frame().running', timeout=5000)
                result['resumePassed'] = True
            except Exception as error:
                result['liveError'] = str(error)[:500]
                static = args.output_dir / (item['id'] + '-static.png')
                try:
                    process = subprocess.run([args.node, str(args.runner), item['scenePkgPath'], str(static), '1920', '1080', ''],
                        capture_output=True, text=True, timeout=180, creationflags=subprocess.CREATE_NO_WINDOW)
                    if process.returncode != 0:
                        raise RuntimeError(process.stderr[:500])
                    result.update(status='static', staticInfo=json.loads(process.stdout), staticBytes=static.stat().st_size)
                except Exception as static_error:
                    result['staticError'] = str(static_error)[:500]
            finally:
                result['seconds'] = round(time.monotonic() - started, 1)
                page.close()
                results.append(result)
                (args.output_dir / 'scene-results.json').write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding='utf-8')
                print(json.dumps(result, ensure_ascii=False), flush=True)
    finally:
        browser.close()

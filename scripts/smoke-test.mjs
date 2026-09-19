#!/usr/bin/env node
// Browser smoke test: a production build must not just compile, it must
// actually boot in a real browser. This catches init-order bugs (e.g.
// circular ES module chunks) that tsc/vitest/eslint cannot see, because none
// of them execute the built bundle in a JS engine that enforces real module
// evaluation order the way a browser does.
//
// Usage: npm run build && node scripts/smoke-test.mjs
// Exit code 0 = pass, 1 = fail. Prints diagnostics on failure.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import process from 'node:process';

const HOST = '127.0.0.1';
const PORT = 4173;
const URL = `http://${HOST}:${PORT}/`;
const BOOT_TIMEOUT_MS = 8000;

function waitForServer(proc, url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Timed out waiting for preview server at ${url}`));
      }
    }, timeoutMs);

    const tryConnect = async () => {
      if (settled) return;
      try {
        const res = await fetch(url);
        if (res.ok || res.status < 500) {
          settled = true;
          clearTimeout(timer);
          resolve();
          return;
        }
      } catch {
        // not up yet
      }
      if (!settled) setTimeout(tryConnect, 200);
    };
    tryConnect();

    proc.on('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`vite preview exited early with code ${code}`));
      }
    });
  });
}

async function main() {
  console.log('[smoke-test] starting `vite preview`...');
  const preview = spawn(
    'npx',
    ['vite', 'preview', '--host', HOST, '--port', String(PORT), '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let previewOutput = '';
  preview.stdout.on('data', (d) => (previewOutput += d));
  preview.stderr.on('data', (d) => (previewOutput += d));

  let exitCode = 1;
  try {
    await waitForServer(preview, URL, 15000);
    console.log(`[smoke-test] preview server up at ${URL}`);

    const browser = await chromium.launch();
    const page = await browser.newPage();

    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    console.log(`[smoke-test] loading ${URL} ...`);
    await page.goto(URL, { waitUntil: 'load', timeout: BOOT_TIMEOUT_MS });

    // Give React a moment to mount after load (async chunks, mic-init, etc.)
    await page.waitForTimeout(1500);

    const rootHTML = await page.evaluate(() => {
      const root = document.getElementById('root');
      return root ? root.innerHTML : null;
    });

    await browser.close();

    const failures = [];
    if (pageErrors.length > 0) {
      failures.push(`${pageErrors.length} uncaught page error(s):\n  - ${pageErrors.join('\n  - ')}`);
    }
    if (rootHTML === null) {
      failures.push('#root element not found in DOM');
    } else if (rootHTML.trim().length < 50) {
      failures.push(`#root has trivial/empty content (${rootHTML.trim().length} chars): ${JSON.stringify(rootHTML.slice(0, 200))}`);
    }

    if (failures.length > 0) {
      console.error('[smoke-test] FAIL');
      for (const f of failures) console.error(`  - ${f}`);
      if (consoleErrors.length > 0) {
        console.error('  (console errors, informational):');
        for (const c of consoleErrors) console.error(`    - ${c}`);
      }
      exitCode = 1;
    } else {
      console.log(`[smoke-test] PASS — #root populated with ${rootHTML.length} chars, no page errors.`);
      exitCode = 0;
    }
  } catch (err) {
    console.error('[smoke-test] FAIL —', err.message);
    console.error('--- preview server output ---');
    console.error(previewOutput);
    exitCode = 1;
  } finally {
    preview.kill();
  }

  process.exit(exitCode);
}

main();

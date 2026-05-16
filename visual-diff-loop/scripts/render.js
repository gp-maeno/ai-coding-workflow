#!/usr/bin/env node
/**
 * render.js
 *
 * targets.json に定義された各ターゲットを、各 viewport で Playwright を使ってスクショ取得。
 * renders/<viewport>/<target-id>.png として保存する。
 *
 * 前提: src/ をローカルサーバーで配信していること。
 *       例: `npx serve src -p 3000`
 *
 * 使い方:
 *   node scripts/render.js
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const TARGETS_PATH = path.join(__dirname, 'targets.json');
const RENDERS_DIR = path.join(__dirname, '..', 'renders');

(async () => {
  const config = JSON.parse(fs.readFileSync(TARGETS_PATH, 'utf-8'));
  const { viewports, targets } = config;

  const browser = await chromium.launch();

  for (const [vpName, vpConfig] of Object.entries(viewports)) {
    const targetsForVp = targets.filter((t) =>
      (t.viewports || ['pc']).includes(vpName)
    );
    if (targetsForVp.length === 0) continue;

    console.log(`[${vpName}] Rendering ${targetsForVp.length} targets...`);

    // deviceScaleFactor を 2 にして Figma の scale=2 と揃える。
    const context = await browser.newContext({
      viewport: { width: vpConfig.width, height: vpConfig.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    for (const t of targetsForVp) {
      try {
        await page.goto(t.renderUrl, { waitUntil: 'networkidle' });

        // フォント描画の安定化（webfontの遅延ロード対策）
        await page.evaluate(() => document.fonts.ready);

        // セクション全体をスクショ。renderUrl にハッシュ指定（#hero など）が
        // あればその要素を、なければ body 全体を撮る。
        const hash = new URL(t.renderUrl).hash.replace('#', '');
        let target;
        if (hash) {
          target = page.locator(`#${hash}`);
          await target.scrollIntoViewIfNeeded();
        } else {
          target = page.locator('body');
        }

        const destDir = path.join(RENDERS_DIR, vpName);
        fs.mkdirSync(destDir, { recursive: true });
        const destPath = path.join(destDir, `${t.id}.png`);

        await target.screenshot({ path: destPath });
        console.log(`  Saved: ${path.relative(process.cwd(), destPath)}`);
      } catch (err) {
        console.error(`  Failed: ${t.id} (${vpName}) — ${err.message}`);
      }
    }

    await context.close();
  }

  await browser.close();
  console.log('\nDone.');
})();

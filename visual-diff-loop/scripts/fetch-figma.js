#!/usr/bin/env node
/**
 * fetch-figma.js
 *
 * Figma API から、targets.json で指定された各 Frame のリファレンス画像（PNG）を取得し
 * references/<viewport>/<target-id>.png として保存する。
 *
 * 環境変数:
 *   FIGMA_TOKEN     - Figma個人アクセストークン (Settings > Personal access tokens)
 *   FIGMA_FILE_KEY  - Figma ファイルキー (URL の /file/<ここ>/... )
 *
 * 使い方:
 *   node scripts/fetch-figma.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const TARGETS_PATH = path.join(__dirname, 'targets.json');
const REFERENCES_DIR = path.join(__dirname, '..', 'references');

const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
const FIGMA_FILE_KEY = process.env.FIGMA_FILE_KEY;

if (!FIGMA_TOKEN || !FIGMA_FILE_KEY) {
  console.error('Error: FIGMA_TOKEN と FIGMA_FILE_KEY を環境変数に設定してください。');
  process.exit(1);
}

/**
 * Figma API を呼ぶ汎用関数。
 */
function figmaApi(pathname) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.figma.com',
      path: pathname,
      headers: { 'X-Figma-Token': FIGMA_TOKEN },
    };
    https
      .get(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

/**
 * 画像URLからファイルをダウンロード。
 */
function download(url, destPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const file = fs.createWriteStream(destPath);
    https
      .get(url, (res) => {
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      })
      .on('error', (err) => {
        fs.unlink(destPath, () => reject(err));
      });
  });
}

(async () => {
  const config = JSON.parse(fs.readFileSync(TARGETS_PATH, 'utf-8'));
  const { viewports, targets } = config;

  // Figmaへのリクエストはまとめると効率的だが、viewport ごとにスケールが違うので分ける。
  // PC=2x, Tablet=2x, SP=2x で書き出してから Playwright 側でリサイズ。
  // ここでは単純化のため scale=2 で固定し、render 側で同サイズに揃える。

  for (const [vpName, vpConfig] of Object.entries(viewports)) {
    const targetsForVp = targets.filter((t) =>
      (t.viewports || ['pc']).includes(vpName)
    );
    if (targetsForVp.length === 0) continue;

    const nodeIds = targetsForVp.map((t) => t.figmaNodeId).join(',');
    const apiPath = `/v1/images/${FIGMA_FILE_KEY}?ids=${encodeURIComponent(
      nodeIds
    )}&format=png&scale=2`;

    console.log(`[${vpName}] Fetching ${targetsForVp.length} images...`);
    const res = await figmaApi(apiPath);

    if (res.err) {
      console.error(`  Error: ${res.err}`);
      continue;
    }

    for (const t of targetsForVp) {
      const url = res.images[t.figmaNodeId];
      if (!url) {
        console.error(`  Warn: no image URL for ${t.id} (${t.figmaNodeId})`);
        continue;
      }
      const dest = path.join(REFERENCES_DIR, vpName, `${t.id}.png`);
      await download(url, dest);
      console.log(`  Saved: ${path.relative(process.cwd(), dest)}`);
    }
  }

  console.log('\nDone.');
})();

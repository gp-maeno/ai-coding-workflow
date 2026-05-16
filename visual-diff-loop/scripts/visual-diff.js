#!/usr/bin/env node
/**
 * visual-diff.js
 *
 * references/ と renders/ の同名画像を pixelmatch でピクセル比較し、
 * 差分画像と JSON レポート、HTML レポートを生成する。
 *
 * 使い方:
 *   node scripts/visual-diff.js
 *
 * 出力:
 *   report/diff.json   - 各ターゲットの差分スコアと判定（Claude Code が読む）
 *   report/index.html  - 人間用ビジュアル確認ページ
 *   report/diffs/...   - 差分可視化画像
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

const TARGETS_PATH = path.join(__dirname, 'targets.json');
const REFERENCES_DIR = path.join(__dirname, '..', 'references');
const RENDERS_DIR = path.join(__dirname, '..', 'renders');
const REPORT_DIR = path.join(__dirname, '..', 'report');
const DIFFS_DIR = path.join(REPORT_DIR, 'diffs');

function loadPng(filePath) {
  const data = fs.readFileSync(filePath);
  return PNG.sync.read(data);
}

/**
 * 2つの画像のサイズを揃える。小さい方に合わせて切り抜く。
 * 完全に揃ったサイズを担保するため、Figma書き出しとPlaywright撮影で
 * 同 scale=2、同 viewport 幅を使う前提だが、念のためフォールバック。
 */
function normalize(a, b) {
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);

  const crop = (img) => {
    if (img.width === width && img.height === height) return img;
    const out = new PNG({ width, height });
    PNG.bitblt(img, out, 0, 0, width, height, 0, 0);
    return out;
  };

  return [crop(a), crop(b), width, height];
}

function compare(refPath, renderPath, diffOutPath) {
  if (!fs.existsSync(refPath)) {
    return { error: `reference not found: ${refPath}` };
  }
  if (!fs.existsSync(renderPath)) {
    return { error: `render not found: ${renderPath}` };
  }

  const refImg = loadPng(refPath);
  const renderImg = loadPng(renderPath);

  const [a, b, width, height] = normalize(refImg, renderImg);
  const diff = new PNG({ width, height });

  const numDiffPixels = pixelmatch(a.data, b.data, diff.data, width, height, {
    threshold: 0.1,         // 個別ピクセル差の許容（0.1 = アンチエイリアス許容）
    includeAA: false,        // アンチエイリアス検出は無視
    alpha: 0.3,
    diffColor: [255, 0, 0],
  });

  fs.mkdirSync(path.dirname(diffOutPath), { recursive: true });
  fs.writeFileSync(diffOutPath, PNG.sync.write(diff));

  const totalPixels = width * height;
  const score = 1 - numDiffPixels / totalPixels;
  return { score, numDiffPixels, totalPixels, width, height };
}

(async () => {
  const config = JSON.parse(fs.readFileSync(TARGETS_PATH, 'utf-8'));
  const { viewports, targets, passThreshold } = config;
  const globalThreshold = passThreshold || 0.95;

  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const results = [];

  for (const t of targets) {
    for (const vpName of t.viewports || ['pc']) {
      const refPath = path.join(REFERENCES_DIR, vpName, `${t.id}.png`);
      const renderPath = path.join(RENDERS_DIR, vpName, `${t.id}.png`);
      const diffPath = path.join(DIFFS_DIR, vpName, `${t.id}.png`);

      const result = compare(refPath, renderPath, diffPath);
      const threshold = t.threshold || globalThreshold;

      results.push({
        id: t.id,
        label: t.label,
        viewport: vpName,
        threshold,
        ...result,
        pass: result.score !== undefined ? result.score >= threshold : false,
        referenceImage: path.relative(REPORT_DIR, refPath),
        renderImage: path.relative(REPORT_DIR, renderPath),
        diffImage: path.relative(REPORT_DIR, diffPath),
      });
    }
  }

  const overallPass = results.every((r) => r.pass);
  const overallScore =
    results
      .filter((r) => typeof r.score === 'number')
      .reduce((s, r) => s + r.score, 0) /
      results.filter((r) => typeof r.score === 'number').length || 0;

  const report = {
    generatedAt: new Date().toISOString(),
    pass: overallPass,
    overallScore,
    globalThreshold,
    results,
  };

  fs.writeFileSync(
    path.join(REPORT_DIR, 'diff.json'),
    JSON.stringify(report, null, 2)
  );

  // HTML レポート生成（人間用ビジュアル確認）
  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>Visual Diff Report</title>
<style>
  body{font-family:system-ui,sans-serif;margin:24px;background:#fafafa;color:#222}
  h1{font-size:20px;margin:0 0 8px}
  .summary{padding:16px;background:#fff;border-radius:8px;margin-bottom:24px;border-left:6px solid ${overallPass ? '#0a0' : '#d22'}}
  .target{background:#fff;border-radius:8px;padding:16px;margin-bottom:16px}
  .target h2{font-size:16px;margin:0 0 8px}
  .row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px}
  .row img{width:100%;border:1px solid #ddd;background:#fff}
  .caption{font-size:12px;color:#666;text-align:center}
  .pass{color:#0a0}.fail{color:#d22}
</style></head><body>
<h1>Visual Diff Report</h1>
<div class="summary">
  <strong>Overall: ${overallPass ? '<span class="pass">PASS</span>' : '<span class="fail">FAIL</span>'}</strong>
  &nbsp;|&nbsp; Score: ${(overallScore * 100).toFixed(2)}%
  &nbsp;|&nbsp; Threshold: ${(globalThreshold * 100).toFixed(0)}%
</div>
${results
  .map(
    (r) => `<div class="target">
  <h2>${r.label} <small>(${r.viewport})</small> — ${
      r.pass ? '<span class="pass">PASS</span>' : '<span class="fail">FAIL</span>'
    } ${typeof r.score === 'number' ? `(${(r.score * 100).toFixed(2)}%)` : `<em>${r.error || ''}</em>`}</h2>
  <div class="row">
    <div><img src="${r.referenceImage}"><div class="caption">Figma (reference)</div></div>
    <div><img src="${r.renderImage}"><div class="caption">Rendered (your code)</div></div>
    <div><img src="${r.diffImage}"><div class="caption">Diff</div></div>
  </div>
</div>`
  )
  .join('')}
</body></html>`;

  fs.writeFileSync(path.join(REPORT_DIR, 'index.html'), html);

  // 標準出力にも要約を出す
  console.log('\n=== Visual Diff Result ===');
  console.log(`Overall: ${overallPass ? 'PASS' : 'FAIL'}`);
  console.log(`Overall score: ${(overallScore * 100).toFixed(2)}%`);
  for (const r of results) {
    const mark = r.pass ? '✓' : '✗';
    const s =
      typeof r.score === 'number'
        ? `${(r.score * 100).toFixed(2)}%`
        : r.error || 'n/a';
    console.log(`  ${mark} ${r.id} [${r.viewport}] ${s} (threshold ${r.threshold})`);
  }
  console.log(`\nReport: ${path.relative(process.cwd(), path.join(REPORT_DIR, 'index.html'))}`);

  // Claude Code がCI的に判定できるよう非ゼロ終了する
  process.exit(overallPass ? 0 : 1);
})();

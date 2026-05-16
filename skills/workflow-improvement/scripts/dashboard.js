#!/usr/bin/env node
/**
 * dashboard.js
 *
 * retrospectives/ 配下の振り返りを集約し、HTMLダッシュボードを生成する。
 *
 * 使い方:
 *   node dashboard.js \
 *     --retrospectives ./retrospectives/ \
 *     --out ./dashboard.html
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const getArg = (n, d = null) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};

const RETRO_DIR = getArg('--retrospectives', './retrospectives');
const OUT_PATH = getArg('--out', './dashboard.html');

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]+?)\n---/);
  if (!m) return null;
  const obj = {};
  let currentKey = null;
  const listItems = [];
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) {
      if (currentKey && listItems.length) {
        obj[currentKey] = [...listItems];
        listItems.length = 0;
      }
      currentKey = kv[1];
      const v = kv[2].trim();
      if (v === '') {
        // 配列開始
      } else {
        obj[currentKey] = parseValue(v);
        currentKey = null;
      }
    } else if (line.match(/^\s+-\s+/) && currentKey) {
      listItems.push(line.replace(/^\s+-\s+/, '').replace(/^"(.+)"$/, '$1').trim());
    }
  }
  if (currentKey && listItems.length) obj[currentKey] = listItems;
  return obj;
}
function parseValue(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  return v;
}

(async () => {
  if (!fs.existsSync(RETRO_DIR)) {
    console.error(`Error: ${RETRO_DIR} not found`);
    process.exit(1);
  }
  const files = fs.readdirSync(RETRO_DIR).filter(f => f.endsWith('.md')).sort();
  const items = files.map(f => {
    const t = fs.readFileSync(path.join(RETRO_DIR, f), 'utf-8');
    const meta = parseFrontmatter(t) || {};
    return { file: f, ...meta };
  });

  const passed = items.filter(i => i.passed);
  const avgScore = items.reduce((s, i) => s + (i.finalScore || 0), 0) / Math.max(items.length, 1);
  const avgIter = items.reduce((s, i) => s + (i.iterations || 0), 0) / Math.max(items.length, 1);
  const avgDur = items.reduce((s, i) => s + (i.durationMin || 0), 0) / Math.max(items.length, 1);

  // 業界別
  const byIndustry = {};
  for (const it of items) {
    const ind = it.industry || 'unknown';
    if (!byIndustry[ind]) byIndustry[ind] = [];
    byIndustry[ind].push(it);
  }

  // 苦戦パターン頻度
  const patternFreq = {};
  for (const it of items) {
    for (const p of it.strugglingPatterns || []) {
      patternFreq[p] = (patternFreq[p] || 0) + 1;
    }
  }
  const topPatterns = Object.entries(patternFreq).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // 案件別スコア（時系列）
  const sortedByDate = items.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // ============================================================
  // SVG: 案件別再現率の推移
  // ============================================================
  const svgW = 700, svgH = 240, padL = 60, padR = 20, padT = 20, padB = 60;
  const innerW = svgW - padL - padR;
  const innerH = svgH - padT - padB;
  const n = sortedByDate.length;
  const stepX = n > 1 ? innerW / (n - 1) : 0;
  const pts = sortedByDate.map((it, i) => {
    const x = padL + i * stepX;
    const score = it.finalScore || 0;
    const y = padT + innerH - score * innerH;
    return { x, y, item: it };
  });
  const pathD = pts.length === 0 ? '' :
    'M' + pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L');

  const thresholdY = padT + innerH - 0.95 * innerH;

  const scoreChart = `
<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" class="chart">
  <rect x="${padL}" y="${padT}" width="${innerW}" height="${innerH}" fill="#F7FAFC" stroke="#E2E8F0"/>
  <!-- y軸ラベル -->
  <text x="${padL - 8}" y="${padT + 5}" text-anchor="end" font-size="10" fill="#718096">100%</text>
  <text x="${padL - 8}" y="${padT + innerH/2 + 5}" text-anchor="end" font-size="10" fill="#718096">50%</text>
  <text x="${padL - 8}" y="${padT + innerH + 5}" text-anchor="end" font-size="10" fill="#718096">0%</text>
  <!-- 閾値 95% ライン -->
  <line x1="${padL}" y1="${thresholdY}" x2="${padL + innerW}" y2="${thresholdY}"
        stroke="#ED8936" stroke-width="1" stroke-dasharray="4,4"/>
  <text x="${padL + innerW - 4}" y="${thresholdY - 4}" text-anchor="end" font-size="10" fill="#ED8936">閾値 95%</text>
  <!-- 折れ線 -->
  ${pathD ? `<path d="${pathD}" stroke="#3182CE" stroke-width="2" fill="none"/>` : ''}
  <!-- ドット -->
  ${pts.map(p => `
    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4"
            fill="${p.item.passed ? '#38A169' : '#E53E3E'}"/>
    <title>${p.item.project}: ${((p.item.finalScore || 0) * 100).toFixed(1)}%</title>
  `).join('')}
  <!-- X軸ラベル（最初と最後のみ） -->
  ${pts.length > 0 ? `<text x="${pts[0].x}" y="${svgH - padB + 16}" font-size="10" fill="#4A5568">${pts[0].item.date || ''}</text>` : ''}
  ${pts.length > 1 ? `<text x="${pts[pts.length-1].x}" y="${svgH - padB + 16}" font-size="10" fill="#4A5568" text-anchor="end">${pts[pts.length-1].item.date || ''}</text>` : ''}
</svg>`;

  // ============================================================
  // SVG: 反復回数の分布
  // ============================================================
  const iterBins = [0, 0, 0, 0, 0, 0]; // 0,1,2,3,4,5
  for (const it of items) {
    const i = Math.min(it.iterations || 0, 5);
    iterBins[i]++;
  }
  const maxBin = Math.max(...iterBins, 1);
  const barW = 60, barGap = 12;
  const barChartW = (barW + barGap) * iterBins.length;
  const iterChart = `
<svg viewBox="0 0 ${barChartW + 40} 200" xmlns="http://www.w3.org/2000/svg" class="chart">
  ${iterBins.map((c, i) => {
    const h = c / maxBin * 140;
    const x = 20 + i * (barW + barGap);
    const y = 160 - h;
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="#3182CE" opacity="0.8"/>
      <text x="${x + barW/2}" y="${y - 4}" text-anchor="middle" font-size="11" font-weight="bold" fill="#1A202C">${c}</text>
      <text x="${x + barW/2}" y="${175}" text-anchor="middle" font-size="11" fill="#4A5568">${i}回</text>
    `;
  }).join('')}
</svg>`;

  // ============================================================
  // HTML
  // ============================================================

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ワークフロー改善ダッシュボード</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    font-family: -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif;
    background: #F7FAFC; color: #1A202C; line-height: 1.6;
  }
  .container { max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 24px; margin: 0 0 8px; }
  .updated { color: #718096; font-size: 13px; margin-bottom: 24px; }
  h2 { font-size: 18px; margin: 32px 0 12px; color: #2D3748; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .kpi { background: white; border: 1px solid #E2E8F0; border-radius: 10px; padding: 20px; }
  .kpi .label { font-size: 12px; color: #718096; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
  .kpi .value { font-size: 28px; font-weight: 700; color: #3182CE; margin-top: 4px; }
  .kpi .sub { font-size: 12px; color: #718096; margin-top: 4px; }
  .card { background: white; border: 1px solid #E2E8F0; border-radius: 10px; padding: 24px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #E2E8F0; }
  th { background: #F7FAFC; font-size: 12px; color: #4A5568; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .badge.pass { background: #C6F6D5; color: #2F855A; }
  .badge.fail { background: #FED7D7; color: #C53030; }
  .chart { width: 100%; height: auto; max-width: 100%; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 720px) { .two-col { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="container">
  <h1>ワークフロー改善ダッシュボード</h1>
  <div class="updated">最終更新: ${new Date().toISOString()} · 集計対象: ${items.length} 案件</div>

  <div class="kpis">
    <div class="kpi">
      <div class="label">平均再現率</div>
      <div class="value">${(avgScore * 100).toFixed(1)}%</div>
      <div class="sub">${items.length}案件の平均</div>
    </div>
    <div class="kpi">
      <div class="label">合格率</div>
      <div class="value">${items.length > 0 ? Math.round(passed.length / items.length * 100) : 0}%</div>
      <div class="sub">${passed.length} / ${items.length}</div>
    </div>
    <div class="kpi">
      <div class="label">平均反復回数</div>
      <div class="value">${avgIter.toFixed(1)}</div>
      <div class="sub">Visual Diff ループ</div>
    </div>
    <div class="kpi">
      <div class="label">平均所要時間</div>
      <div class="value">${avgDur.toFixed(0)}分</div>
      <div class="sub">案件あたり</div>
    </div>
  </div>

  <h2>再現率の推移</h2>
  <div class="card">${scoreChart}</div>

  <div class="two-col">
    <div>
      <h2>反復回数の分布</h2>
      <div class="card">${iterChart}</div>
    </div>
    <div>
      <h2>業界別件数</h2>
      <div class="card">
        <table>
          <tr><th>業界</th><th>件数</th></tr>
          ${Object.entries(byIndustry).map(([k, v]) => `<tr><td>${k}</td><td>${v.length}</td></tr>`).join('')}
        </table>
      </div>
    </div>
  </div>

  <h2>頻出する苦戦パターン</h2>
  <div class="card">
    <table>
      <tr><th>パターン</th><th>件数</th></tr>
      ${topPatterns.length === 0 ? '<tr><td colspan="2">データが蓄積されるとここに表示されます</td></tr>' :
        topPatterns.map(([p, c]) => `<tr><td><code>${p}</code></td><td>${c}</td></tr>`).join('')}
    </table>
  </div>

  <h2>案件一覧</h2>
  <div class="card">
    <table>
      <tr><th>日付</th><th>案件名</th><th>業界</th><th>再現率</th><th>反復</th><th>判定</th></tr>
      ${sortedByDate.map(i => `
        <tr>
          <td>${i.date || ''}</td>
          <td>${i.project || i.file}</td>
          <td>${i.industry || ''}</td>
          <td>${((i.finalScore || 0) * 100).toFixed(1)}%</td>
          <td>${i.iterations || ''}</td>
          <td><span class="badge ${i.passed ? 'pass' : 'fail'}">${i.passed ? 'PASS' : 'FAIL'}</span></td>
        </tr>
      `).join('')}
    </table>
  </div>
</div>
</body>
</html>`;

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, html);
  console.error(`Wrote: ${OUT_PATH}`);
  console.error(`集計対象: ${items.length} 案件`);
})();

#!/usr/bin/env node
/**
 * propose-rule-updates.js
 *
 * 蓄積された retrospective を集約し、figma-structure-check の
 * ルール更新提案を Markdown で生成する。
 *
 * 使い方:
 *   node propose-rule-updates.js \
 *     --retrospectives ./retrospectives/ \
 *     --rules ./skills/figma-structure-check/rules/check-rules.json \
 *     --out ./rule-update-proposals/202605.md
 *
 * 注: 自動でルールを書き換えない。提案を出すだけ。人が承認して反映する。
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const getArg = (name, def = null) => {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : def;
};

const RETRO_DIR = getArg('--retrospectives', './retrospectives');
const RULES_PATH = getArg('--rules', './skills/figma-structure-check/rules/check-rules.json');
const OUT_PATH = getArg('--out', `./rule-update-proposals/${new Date().toISOString().substring(0, 7).replace('-', '')}.md`);

// Frontmatter簡易パーサ
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]+?)\n---/);
  if (!m) return null;
  const body = m[1];
  const obj = {};
  let currentKey = null;
  const listItems = [];
  for (const line of body.split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) {
      if (currentKey && listItems.length) {
        obj[currentKey] = [...listItems];
        listItems.length = 0;
      }
      currentKey = kv[1];
      const value = kv[2].trim();
      if (value === '') {
        // 配列開始の可能性
      } else {
        obj[currentKey] = parseValue(value);
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

// retrospective ディレクトリから全部読み込み
function loadAllRetrospectives() {
  if (!fs.existsSync(RETRO_DIR)) {
    console.error(`Warning: ${RETRO_DIR} が見つかりません`);
    return [];
  }
  const files = fs.readdirSync(RETRO_DIR).filter(f => f.endsWith('.md'));
  const items = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(RETRO_DIR, f), 'utf-8');
    const meta = parseFrontmatter(text);
    if (!meta) continue;
    // ルール改善提案セクションを抽出
    const ruleSection = text.match(/## ルール改善提案[\s\S]+?(?=\n##\s|\n---|$)/);
    items.push({
      file: f,
      meta,
      ruleSection: ruleSection ? ruleSection[0] : '',
      body: text,
    });
  }
  return items;
}

(async () => {
  const items = loadAllRetrospectives();
  const rules = fs.existsSync(RULES_PATH) ? JSON.parse(fs.readFileSync(RULES_PATH, 'utf-8')) : { rules: {} };

  if (items.length === 0) {
    console.error('Error: 振り返りが見つかりません。先に generate-retrospective.js で生成してください。');
    process.exit(1);
  }

  // ============================================================
  // 集約
  // ============================================================

  const totals = {
    count: items.length,
    avgScore: 0,
    avgIterations: 0,
    avgDuration: 0,
    passRate: 0,
    industries: {},
  };

  const patternFreq = {};
  const ruleHits = {}; // 既存ルールがどのくらい引っかかったか（structureCheckErrors/Warningsが0だった案件をPASSと数える）

  for (const it of items) {
    totals.avgScore += it.meta.finalScore || 0;
    totals.avgIterations += it.meta.iterations || 0;
    totals.avgDuration += it.meta.durationMin || 0;
    if (it.meta.passed) totals.passRate++;
    const ind = it.meta.industry || 'unknown';
    totals.industries[ind] = (totals.industries[ind] || 0) + 1;

    const patterns = it.meta.strugglingPatterns || [];
    for (const p of patterns) {
      patternFreq[p] = (patternFreq[p] || 0) + 1;
    }
  }

  totals.avgScore = (totals.avgScore / items.length * 100).toFixed(2);
  totals.avgIterations = (totals.avgIterations / items.length).toFixed(2);
  totals.avgDuration = (totals.avgDuration / items.length).toFixed(1);
  totals.passRate = (totals.passRate / items.length * 100).toFixed(1);

  const topPatterns = Object.entries(patternFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // ============================================================
  // 既存ルールでカバーされていないパターンを検出
  // ============================================================

  const existingRules = Object.keys(rules.rules || {});
  const uncoveredPatterns = topPatterns.filter(([p]) => {
    // パターン名と既存ルール名のキーワード一致でカバー判定
    const pLower = p.toLowerCase();
    return !existingRules.some(r => pLower.includes(r.toLowerCase().split('-')[0]));
  });

  // ============================================================
  // ルール調整提案を組み立て（既存ルールのうち、頻発パターンに関連するものはseverity引き上げ提案）
  // ============================================================

  const severityProposals = [];

  if (patternFreq['background-blur-strong'] && patternFreq['background-blur-strong'] >= 2) {
    const current = rules.rules['hard-to-reproduce'];
    if (current && current.severity === 'warning') {
      severityProposals.push({
        ruleId: 'hard-to-reproduce',
        change: '`severity: warning` → `error`',
        reason: `background-blur-strong が ${patternFreq['background-blur-strong']} 件で苦戦パターンとして頻発。早期に検出し差し戻すべき。`,
      });
    }
  }

  if (patternFreq['fontWeight-rendering'] && patternFreq['fontWeight-rendering'] >= 2) {
    severityProposals.push({
      ruleId: '(新規) font-weight-restriction',
      change: '新ルール追加',
      reason: `fontWeight-rendering の差が ${patternFreq['fontWeight-rendering']} 件で発生。「使用可能なフォントウェイトを 400 / 700 に限定する」ルール追加を提案。`,
    });
  }

  // ============================================================
  // Markdown 生成
  // ============================================================

  let md = `# ルール更新提案 — ${new Date().toISOString().substring(0, 10)}\n\n`;
  md += `<!-- 自動生成 by propose-rule-updates.js -->\n`;
  md += `<!-- 集計対象: ${items.length} 件の retrospective -->\n\n`;

  md += `## 集計サマリー\n\n`;
  md += `| 項目 | 値 |\n|---|---|\n`;
  md += `| 対象案件数 | ${items.length} |\n`;
  md += `| 平均再現率 | ${totals.avgScore}% |\n`;
  md += `| 平均反復回数 | ${totals.avgIterations} |\n`;
  md += `| 平均所要時間 | ${totals.avgDuration} 分 |\n`;
  md += `| 合格率 | ${totals.passRate}% |\n`;
  md += `\n`;

  md += `### 業界別内訳\n\n`;
  md += `| 業界 | 件数 |\n|---|---|\n`;
  for (const [k, v] of Object.entries(totals.industries)) {
    md += `| ${k} | ${v} |\n`;
  }
  md += `\n`;

  md += `## 頻出する苦戦パターン（Top 10）\n\n`;
  md += `| パターン | 件数 | 既存ルールでカバー |\n|---|---|---|\n`;
  for (const [p, c] of topPatterns) {
    const covered = !uncoveredPatterns.find(([up]) => up === p);
    md += `| \`${p}\` | ${c} | ${covered ? '✓ あり' : '✗ なし（要対応）'} |\n`;
  }
  md += `\n`;

  md += `## ルール変更提案\n\n`;
  if (severityProposals.length === 0 && uncoveredPatterns.length === 0) {
    md += `現時点で自動提案できる変更はありません。retrospective がさらに蓄積されると、より具体的な提案が可能になります。\n\n`;
  } else {
    if (severityProposals.length) {
      md += `### 既存ルールの調整\n\n`;
      for (const p of severityProposals) {
        md += `#### \`${p.ruleId}\`\n\n`;
        md += `- **変更**: ${p.change}\n`;
        md += `- **理由**: ${p.reason}\n\n`;
      }
    }
    if (uncoveredPatterns.length) {
      md += `### 新規ルール追加候補\n\n`;
      for (const [p, c] of uncoveredPatterns) {
        md += `- \`${p}\` (${c}件) — 現状ルールでカバーされていません。検出基準を策定して追加検討してください。\n`;
      }
      md += `\n`;
    }
  }

  md += `## AI が記述したルール改善ヒント（各案件からの抜粋）\n\n`;
  for (const it of items.slice(0, 10)) {
    const hint = it.ruleSection.replace(/^## ルール改善提案[^\n]*\n+/, '').trim();
    if (!hint || hint.length < 10) continue;
    md += `### ${it.meta.project || it.file}\n\n`;
    md += hint.split('\n').slice(0, 5).join('\n') + '\n\n';
  }

  md += `---\n\n`;
  md += `## レビュー後のアクション\n\n`;
  md += `1. 採用する提案を選定\n`;
  md += `2. \`skills/figma-structure-check/rules/check-rules.json\` を更新\n`;
  md += `3. 変更をコミットしてチームに共有\n`;
  md += `4. 次の月次レビューまで運用し、効果を測定\n`;

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, md);

  console.error(`Wrote: ${OUT_PATH}`);
  console.error(`集計対象: ${items.length} 件、変更提案: ${severityProposals.length} 件、新規候補: ${uncoveredPatterns.length} 件`);
})();

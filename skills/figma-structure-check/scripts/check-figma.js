#!/usr/bin/env node
/**
 * check-figma.js
 *
 * Figma REST API でファイル構造を取得し、rules/check-rules.json に従って違反を検出する。
 *
 * 使い方:
 *   FIGMA_TOKEN=xxx FIGMA_FILE_KEY=xxx node check-figma.js
 *   FIGMA_FILE_KEY=xxx node check-figma.js --node 1:23     # 特定ノードのみ
 *   FIGMA_FILE_KEY=xxx node check-figma.js --report        # Markdown レポート出力
 *
 * 出力:
 *   標準出力に JSON（--report の場合は Markdown）
 *   標準エラー出力にサマリー
 *   違反が error 1件以上なら exit code 1
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const RULES_PATH = path.join(__dirname, '..', 'rules', 'check-rules.json');

const args = process.argv.slice(2);
const nodeIdArg = args.includes('--node')
  ? args[args.indexOf('--node') + 1]
  : null;
const reportMode = args.includes('--report');

const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
const FIGMA_FILE_KEY = process.env.FIGMA_FILE_KEY;

if (!FIGMA_TOKEN || !FIGMA_FILE_KEY) {
  console.error('Error: FIGMA_TOKEN と FIGMA_FILE_KEY を環境変数に設定してください。');
  process.exit(2);
}

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
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
      })
      .on('error', reject);
  });
}

/**
 * Figmaノードツリーを再帰的にたどり、各ノードに対してcheckFnを呼ぶ。
 * 引数 path はノード名のスラッシュ区切り（位置の特定に使う）。
 */
function walk(node, checkFn, depth = 0, parentPath = '') {
  const currentPath = parentPath ? `${parentPath} / ${node.name}` : node.name;
  checkFn(node, depth, currentPath);
  if (node.children) {
    for (const child of node.children) {
      walk(child, checkFn, depth + 1, currentPath);
    }
  }
}

// ============================================================
// 個別チェック関数群
// 各関数は (node, rules) を受け取り、違反の配列を返す。
// ============================================================

function checkAutoLayout(node, rule, depth) {
  if (!rule.enabled) return [];
  if (depth === 0 && rule.exceptions?.topLevelPage) return [];
  if (!rule.appliesTo.includes(node.type)) return [];
  // Auto Layoutは layoutMode が 'HORIZONTAL' or 'VERTICAL' なら有効
  if (node.layoutMode && node.layoutMode !== 'NONE') return [];
  return [{
    severity: rule.severity,
    rule: 'auto-layout',
    nodeId: node.id,
    nodeName: node.name,
    message: 'FRAMEがAuto Layoutを使用していません',
    fix: rule.fixGuidance,
  }];
}

function checkVariablesColor(node, rule) {
  if (!rule.enabled) return [];
  if (!rule.appliesTo.includes(node.type)) return [];
  if (!node.fills || node.fills.length === 0) return [];
  const violations = [];
  const whitelist = (rule.whitelist?.colors || []).map(c => c.toLowerCase());
  for (const fill of node.fills) {
    if (fill.type !== 'SOLID') continue;
    if (!fill.color) continue;
    const hex = rgbToHex(fill.color);
    if (whitelist.includes(hex.toLowerCase())) continue;
    const bound = node.boundVariables?.fills;
    if (!bound) {
      violations.push({
        severity: rule.severity,
        rule: 'variables-color',
        nodeId: node.id,
        nodeName: node.name,
        message: `塗り色 ${hex} が Variable にバインドされていません`,
        fix: rule.fixGuidance,
      });
      break; // 同一ノードで複数違反を立てない
    }
  }
  return violations;
}

function checkVariablesTypography(node, rule) {
  if (!rule.enabled) return [];
  if (node.type !== 'TEXT') return [];
  const bound = node.boundVariables || {};
  const style = node.style || {};
  const violations = [];
  // textStyleId が空で、Variableも未バインドなら違反
  if (!node.styles?.text && !bound.fontFamily && !bound.fontSize) {
    violations.push({
      severity: rule.severity,
      rule: 'variables-typography',
      nodeId: node.id,
      nodeName: node.name,
      message: `テキスト (font: ${style.fontFamily || '?'} / size: ${style.fontSize || '?'}) が Text Style にも Variable にもバインドされていません`,
      fix: rule.fixGuidance,
    });
  }
  return violations;
}

function checkVariablesSpacing(node, rule) {
  if (!rule.enabled) return [];
  if (!['FRAME', 'INSTANCE'].includes(node.type)) return [];
  if (!node.layoutMode || node.layoutMode === 'NONE') return [];
  const bound = node.boundVariables || {};
  const violations = [];
  const checkProp = (key) => {
    const val = node[key];
    if (typeof val === 'number' && val > 0 && !bound[key]) {
      violations.push({
        severity: rule.severity,
        rule: 'variables-spacing',
        nodeId: node.id,
        nodeName: node.name,
        message: `${key} = ${val}px が Variable にバインドされていません`,
        fix: rule.fixGuidance,
      });
    }
  };
  ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'itemSpacing'].forEach(checkProp);
  return violations;
}

function checkNaming(node, rule, depth) {
  if (!rule.enabled) return [];
  if (depth === 0) return []; // ページ名は対象外
  const name = node.name;
  for (const prefix of rule.deniedPrefixes) {
    if (name.startsWith(prefix) && /^\D+\s\d+$/.test(name)) {
      return [{
        severity: rule.severity,
        rule: 'naming',
        nodeId: node.id,
        nodeName: name,
        message: `デフォルト名 "${name}" が残っています`,
        fix: rule.fixGuidance,
      }];
    }
  }
  if (rule.deniedExactNames.includes(name)) {
    return [{
      severity: rule.severity,
      rule: 'naming',
      nodeId: node.id,
      nodeName: name,
      message: `デフォルト名 "${name}" が残っています`,
      fix: rule.fixGuidance,
    }];
  }
  return [];
}

function checkResponsiveFrames(document, rule) {
  if (!rule.enabled) return [];
  // 各ページ（CANVAS）の直下に pc / sp のFrameがあるかをチェック
  const violations = [];
  for (const canvas of document.children || []) {
    if (canvas.type !== 'CANVAS') continue;
    const directChildren = (canvas.children || []).map(c => c.name.toLowerCase());
    const hasPc = directChildren.some(n => n.includes('pc') || n.includes('desktop'));
    const hasSp = directChildren.some(n => n.includes('sp') || n.includes('mobile'));
    if (!hasPc || !hasSp) {
      violations.push({
        severity: rule.severity,
        rule: 'responsive-frames',
        nodeId: canvas.id,
        nodeName: canvas.name,
        message: `ページ "${canvas.name}" に PC/SP の両Frameが揃っていません (PC: ${hasPc}, SP: ${hasSp})`,
        fix: rule.fixGuidance,
      });
    }
  }
  return violations;
}

function checkImageMarker(node, rule) {
  if (!rule.enabled) return [];
  if (!rule.appliesTo.includes(node.type)) return [];
  const hasImageFill = (node.fills || []).some(f => f.type === 'IMAGE');
  if (!hasImageFill) return [];
  if (node.name.startsWith('@img-') || node.name.startsWith('@deco-')) return [];
  return [{
    severity: rule.severity,
    rule: 'image-marker',
    nodeId: node.id,
    nodeName: node.name,
    message: `画像レイヤー "${node.name}" に @img- プレフィックスがありません`,
    fix: rule.fixGuidance,
  }];
}

function checkA11yAlt(node, rule) {
  if (!rule.enabled) return [];
  const hasImageFill = (node.fills || []).some(f => f.type === 'IMAGE');
  if (!hasImageFill) return [];
  if (node.name.includes('@deco')) return []; // 装飾画像は除外
  // Figma REST API では description は componentProperties や本体に description フィールドがあるが、
  // 通常レイヤーには公式なdescription相当がない。
  // 簡易チェックとして、レイヤー名に "alt:" を含むかで代用するか、別途運用ルールを敷く。
  if (node.name.toLowerCase().includes('alt:')) return [];
  return [{
    severity: rule.severity,
    rule: 'a11y-alt',
    nodeId: node.id,
    nodeName: node.name,
    message: `画像レイヤー "${node.name}" に alt テキストが見当たりません（名前に "alt: ..." を含めるか、運用上の記述場所を統一してください）`,
    fix: rule.fixGuidance,
  }];
}

function checkHardToReproduce(node, rule) {
  if (!rule.enabled) return [];
  const violations = [];
  // 強いブラー
  for (const effect of node.effects || []) {
    if (effect.type === 'BACKGROUND_BLUR' && effect.radius > 20) {
      violations.push({
        severity: rule.severity,
        rule: 'hard-to-reproduce',
        nodeId: node.id,
        nodeName: node.name,
        message: `強い BACKGROUND_BLUR (radius=${effect.radius}) が使われています — backdrop-filter で近似可能ですがブラウザ差が大きいです`,
        fix: rule.fixGuidance,
      });
    }
    if (effect.type === 'LAYER_BLUR' && effect.radius > 15) {
      violations.push({
        severity: rule.severity,
        rule: 'hard-to-reproduce',
        nodeId: node.id,
        nodeName: node.name,
        message: `強い LAYER_BLUR (radius=${effect.radius}) — filter: blur() で再現可能だが描画コストが高い`,
        fix: rule.fixGuidance,
      });
    }
  }
  // 非標準のブレンドモード
  if (node.blendMode && node.blendMode !== 'PASS_THROUGH' && node.blendMode !== 'NORMAL') {
    violations.push({
      severity: rule.severity,
      rule: 'hard-to-reproduce',
      nodeId: node.id,
      nodeName: node.name,
      message: `非標準の blend-mode "${node.blendMode}" が使われています — CSS mix-blend-mode で近似可能だがブラウザ差あり`,
      fix: rule.fixGuidance,
    });
  }
  return violations;
}

// ============================================================
// ユーティリティ
// ============================================================

function rgbToHex({ r, g, b }) {
  const to = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

// ============================================================
// メイン
// ============================================================

(async () => {
  const rulesConfig = JSON.parse(fs.readFileSync(RULES_PATH, 'utf-8'));
  const rules = rulesConfig.rules;

  // ファイル全体 or 特定ノードを取得
  let fileData;
  if (nodeIdArg) {
    fileData = await figmaApi(
      `/v1/files/${FIGMA_FILE_KEY}/nodes?ids=${encodeURIComponent(nodeIdArg)}`
    );
    fileData = {
      document: { children: Object.values(fileData.nodes).map(n => n.document) },
    };
  } else {
    fileData = await figmaApi(`/v1/files/${FIGMA_FILE_KEY}`);
  }

  if (fileData.err) {
    console.error(`Figma API error: ${fileData.err}`);
    process.exit(2);
  }

  const violations = [];
  let totalNodes = 0;

  walk(fileData.document, (node, depth, currentPath) => {
    totalNodes++;
    violations.push(...checkAutoLayout(node, rules['auto-layout'] || {}, depth));
    violations.push(...checkVariablesColor(node, rules['variables-color'] || {}));
    violations.push(...checkVariablesTypography(node, rules['variables-typography'] || {}));
    violations.push(...checkVariablesSpacing(node, rules['variables-spacing'] || {}));
    violations.push(...checkNaming(node, rules['naming'] || {}, depth));
    violations.push(...checkImageMarker(node, rules['image-marker'] || {}));
    violations.push(...checkA11yAlt(node, rules['a11y-alt'] || {}));
    violations.push(...checkHardToReproduce(node, rules['hard-to-reproduce'] || {}));
  });

  // レスポンシブはドキュメントレベルで判定
  violations.push(...checkResponsiveFrames(fileData.document, rules['responsive-frames'] || {}));

  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');
  const infos = violations.filter(v => v.severity === 'info');

  const report = {
    fileKey: FIGMA_FILE_KEY,
    checkedAt: new Date().toISOString(),
    summary: {
      totalNodes,
      errors: errors.length,
      warnings: warnings.length,
      infos: infos.length,
      passed: errors.length === 0,
    },
    violations,
  };

  if (reportMode) {
    console.log(formatMarkdown(report));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }

  console.error(`\nSummary: ${errors.length} errors, ${warnings.length} warnings, ${infos.length} infos (totalNodes=${totalNodes})`);
  console.error(report.summary.passed ? 'PASSED ✓' : 'FAILED ✗');

  process.exit(report.summary.passed ? 0 : 1);
})().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(2);
});

function formatMarkdown(report) {
  const figmaUrl = (nodeId) =>
    `https://www.figma.com/file/${report.fileKey}?node-id=${encodeURIComponent(nodeId)}`;

  const groupByRule = {};
  for (const v of report.violations) {
    (groupByRule[v.rule] = groupByRule[v.rule] || []).push(v);
  }

  let md = `# Figma構造チェック レポート\n\n`;
  md += `- 検査日時: ${report.checkedAt}\n`;
  md += `- ファイル: \`${report.fileKey}\`\n`;
  md += `- 全ノード数: ${report.summary.totalNodes}\n`;
  md += `- **判定: ${report.summary.passed ? '✓ PASSED' : '✗ FAILED'}**\n`;
  md += `- エラー: ${report.summary.errors} / 警告: ${report.summary.warnings} / 情報: ${report.summary.infos}\n\n`;

  if (report.summary.passed && report.summary.warnings === 0) {
    md += `## おめでとうございます\n\n問題は検出されませんでした。Visual Diff ループに進めます。\n`;
    return md;
  }

  md += `## 優先対応リスト\n\n`;
  for (const [ruleId, items] of Object.entries(groupByRule)) {
    md += `### [${items[0].severity.toUpperCase()}] ${ruleId} (${items.length}件)\n\n`;
    md += `${items[0].fix}\n\n`;
    md += `| ノード名 | メッセージ | リンク |\n|---|---|---|\n`;
    for (const v of items) {
      md += `| ${v.nodeName} | ${v.message} | [開く](${figmaUrl(v.nodeId)}) |\n`;
    }
    md += `\n`;
  }
  return md;
}

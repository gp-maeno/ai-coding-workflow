#!/usr/bin/env node
/**
 * generate-spec.js
 *
 * Figmaファイルから情報を抽出し、テンプレートを埋めて spec.md を生成する。
 *
 * 使い方:
 *   FIGMA_TOKEN=xxx FIGMA_FILE_KEY=xxx node generate-spec.js \
 *     --out docs/spec.md \
 *     --project-name "案件名"
 *
 * オプション:
 *   --node <nodeId>     特定ノードのみ
 *   --out <path>        出力先（デフォルト docs/spec.md）
 *   --project-name <s>  案件名
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'spec-template.md');

const args = process.argv.slice(2);
const getArg = (name, def = null) => {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : def;
};

const NODE_ID = getArg('--node');
const OUT_PATH = getArg('--out', 'docs/spec.md');
const PROJECT_NAME = getArg('--project-name', '[TODO] 案件名');
// --with-variables: Figma Variables API (/v1/files/:key/variables/local) を使う。
// このAPIは Enterprise プラン限定。Professional 以下では 403 になるため default OFF。
// 未指定時は Color/Text Styles から代替抽出する。
const WITH_VARIABLES = args.includes('--with-variables');

const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
const FIGMA_FILE_KEY = process.env.FIGMA_FILE_KEY;

if (!FIGMA_TOKEN || !FIGMA_FILE_KEY) {
  console.error('Error: FIGMA_TOKEN と FIGMA_FILE_KEY を設定してください。');
  process.exit(2);
}

function figmaApi(pathname) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.figma.com',
      path: pathname,
      headers: { 'X-Figma-Token': FIGMA_TOKEN },
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function walk(node, visit, depth = 0, ancestors = []) {
  visit(node, depth, ancestors);
  if (node.children) {
    const newAncestors = [...ancestors, node];
    for (const c of node.children) walk(c, visit, depth + 1, newAncestors);
  }
}

function rgbaToHex({ r, g, b, a = 1 }) {
  const to = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}${a < 1 ? to(a) : ''}`.toUpperCase();
}

// ============================================================
// 抽出関数
// ============================================================

/** Figma Variables を取得し、Markdown テーブルにする（Enterprise プラン限定） */
async function extractDesignTokensFromVariables() {
  try {
    const res = await figmaApi(`/v1/files/${FIGMA_FILE_KEY}/variables/local`);
    // Figma API は権限不足時 { status: 403, err: "...", message: "..." } を返す
    if (res.status === 403 || res.err || res.error) {
      return null; // 上位でフォールバックさせる
    }
    if (!res.meta) {
      return '[INFO] Variables が未設定です。手動で記入してください。\n\n| トークン名 | 値 | 用途 |\n|---|---|---|\n| [TODO] | [TODO] | [TODO] |';
    }
    const { variables = {}, variableCollections = {} } = res.meta;
    const rows = [];
    rows.push('| トークン名 | 型 | 値 (default) | 用途 |');
    rows.push('|---|---|---|---|');
    for (const [id, v] of Object.entries(variables)) {
      const collection = variableCollections[v.variableCollectionId];
      const defaultModeId = collection?.defaultModeId;
      const value = v.valuesByMode?.[defaultModeId];
      let display = '';
      if (value && typeof value === 'object' && 'r' in value) {
        display = rgbaToHex(value);
      } else if (typeof value === 'number') {
        display = String(value);
      } else {
        display = JSON.stringify(value);
      }
      const tokenName = `--${v.name.replace(/\//g, '-').toLowerCase()}`;
      rows.push(`| \`${tokenName}\` | ${v.resolvedType} | ${display} | ${v.description || '[TODO]'} |`);
    }
    return rows.join('\n');
  } catch (err) {
    return null;
  }
}

/**
 * Figma Color/Text Styles からデザイントークン候補を抽出する（Professional プラン向け代替）。
 * file response の `styles` メタ情報と、それを参照しているノードの実値をマージして表を作る。
 */
function extractDesignTokensFromStyles(fileData) {
  const stylesMeta = fileData.styles || {};
  if (Object.keys(stylesMeta).length === 0) {
    return '[INFO] Color Styles / Text Styles が見つかりませんでした。デザイナーに Styles 定義を依頼するか、`--with-variables` フラグで Variables API を試してください（Enterprise プランのみ）。\n\n| トークン名 | 値 | 用途 |\n|---|---|---|\n| [TODO] | [TODO] | [TODO] |';
  }

  // Style ID → 実値の解決用に、Styles を参照しているノードを収集する。
  const styleIdToValue = {};
  walk(fileData.document, (node) => {
    const refs = node.styles || {};
    // fill style
    if (refs.fill && !styleIdToValue[refs.fill]) {
      const solid = (node.fills || []).find(f => f.type === 'SOLID');
      if (solid && solid.color) styleIdToValue[refs.fill] = { kind: 'COLOR', value: rgbaToHex({ ...solid.color, a: solid.opacity ?? 1 }) };
    }
    // text style
    if (refs.text && !styleIdToValue[refs.text] && node.style) {
      styleIdToValue[refs.text] = {
        kind: 'TEXT',
        value: `${node.style.fontFamily || '?'} ${node.style.fontWeight || ''} / ${node.style.fontSize || '?'}px`.trim(),
      };
    }
    // effect style
    if (refs.effect && !styleIdToValue[refs.effect]) {
      const eff = (node.effects || [])[0];
      if (eff) styleIdToValue[refs.effect] = { kind: 'EFFECT', value: `${eff.type} radius=${eff.radius ?? '?'}` };
    }
  });

  const rows = ['| トークン名 | 型 | 値 | 用途 |', '|---|---|---|---|'];
  for (const [id, meta] of Object.entries(stylesMeta)) {
    const resolved = styleIdToValue[id];
    const tokenName = `--${meta.name.replace(/\//g, '-').replace(/\s+/g, '-').toLowerCase()}`;
    const displayValue = resolved ? resolved.value : '[未参照ノード — 値不明]';
    rows.push(`| \`${tokenName}\` | ${meta.styleType} | ${displayValue} | ${meta.description || '[TODO]'} |`);
  }
  rows.push('');
  rows.push('> Note: Color/Text Styles から抽出（Professional プラン対応）。Variables を使っている場合は `--with-variables` フラグを付けて再実行してください（Enterprise プランのみ）。');
  return rows.join('\n');
}

/** デザイントークン抽出のエントリポイント。フラグで Variables/Styles を切り替える */
async function extractDesignTokens(fileData) {
  if (WITH_VARIABLES) {
    const fromVariables = await extractDesignTokensFromVariables();
    if (fromVariables !== null) return fromVariables;
    console.error('[WARN] Variables API が利用できませんでした（Enterprise 限定）。Styles から代替抽出します。');
  }
  return extractDesignTokensFromStyles(fileData);
}

/** ページとセクション構成を抽出 */
function extractPagesAndSections(document) {
  const lines = [];
  for (const canvas of document.children || []) {
    if (canvas.type !== 'CANVAS') continue;
    lines.push(`### ${canvas.name}\n`);
    const directFrames = (canvas.children || []).filter(c => c.type === 'FRAME');
    if (directFrames.length === 0) {
      lines.push('[INFO] このページにFrameがありません\n');
      continue;
    }
    lines.push('| ID | セクション名 | サイズ | ノードID |');
    lines.push('|---|---|---|---|');
    for (const frame of directFrames) {
      const slug = slugify(frame.name);
      const size = `${Math.round(frame.absoluteBoundingBox?.width || 0)}×${Math.round(frame.absoluteBoundingBox?.height || 0)}`;
      lines.push(`| \`${slug}\` | ${frame.name} | ${size} | \`${frame.id}\` |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function slugify(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 40);
}

/** PC/SP のペア状況からレスポンシブ仕様を生成 */
function extractResponsive(document) {
  const lines = [];
  const breakpoints = { pc: null, tablet: null, sp: null };
  for (const canvas of document.children || []) {
    if (canvas.type !== 'CANVAS') continue;
    for (const frame of canvas.children || []) {
      if (frame.type !== 'FRAME') continue;
      const w = frame.absoluteBoundingBox?.width;
      if (!w) continue;
      const lower = frame.name.toLowerCase();
      if ((lower.includes('pc') || lower.includes('desktop')) && !breakpoints.pc) breakpoints.pc = w;
      if (lower.includes('tablet') && !breakpoints.tablet) breakpoints.tablet = w;
      if ((lower.includes('sp') || lower.includes('mobile')) && !breakpoints.sp) breakpoints.sp = w;
    }
  }
  lines.push(`- PC: ${breakpoints.pc ? `${breakpoints.pc}px 設計` : '[TODO] PC Frameが検出できませんでした'}`);
  if (breakpoints.tablet) lines.push(`- Tablet: ${breakpoints.tablet}px 設計`);
  lines.push(`- SP: ${breakpoints.sp ? `${breakpoints.sp}px 設計` : '[TODO] SP Frameが検出できませんでした'}`);
  lines.push('');
  lines.push('[TODO] Breakpoint境界値、コンテナ最大幅、グリッド変化の詳細を記入');
  return lines.join('\n');
}

/** @cms- マーカーを集約 */
function extractCmsAreas(document) {
  const found = [];
  walk(document, (node) => {
    if (node.name && node.name.startsWith('@cms-')) {
      const fieldName = node.name.replace(/^@cms-/, '');
      const inputType = inferInputType(node);
      found.push({ id: node.id, name: node.name, fieldName, inputType });
    }
  });
  if (found.length === 0) {
    return '[INFO] @cms- マーカーは検出されませんでした。CMS可変領域がある場合、デザイナーにマーキングを依頼してください。\n\n| フィールド名 | 入力タイプ | 最大文字数 | ノードID |\n|---|---|---|---|\n| [TODO] | [TODO] | [TODO] | [TODO] |';
  }
  const lines = ['| フィールド名 | 入力タイプ | 最大文字数 | ノードID |', '|---|---|---|---|'];
  for (const f of found) {
    lines.push(`| ${f.fieldName} | ${f.inputType} | [TODO] | \`${f.id}\` |`);
  }
  return lines.join('\n');
}

function inferInputType(node) {
  if (node.type === 'TEXT') {
    const len = (node.characters || '').length;
    return len > 50 ? 'textarea' : 'text';
  }
  if (node.fills && node.fills.some(f => f.type === 'IMAGE')) return 'image';
  if (node.type === 'FRAME') return 'repeater';
  return '[TODO]';
}

/** @img- マーカーで画像書き出し対象を列挙 */
function extractImageExports(document) {
  const found = [];
  walk(document, (node) => {
    if (node.name && node.name.startsWith('@img-')) {
      const fileName = node.name.replace(/^@img-/, '');
      const ext = node.type === 'VECTOR' ? 'svg' : 'png';
      found.push({ id: node.id, fileName, ext });
    }
  });
  if (found.length === 0) {
    return '[INFO] @img- マーカーは検出されませんでした。';
  }
  const lines = ['| ファイル名 | 形式 | ノードID |', '|---|---|---|'];
  for (const f of found) {
    lines.push(`| ${f.fileName}.${f.ext} | ${f.ext.toUpperCase()} | \`${f.id}\` |`);
  }
  return lines.join('\n');
}

/** アクセシビリティ alt 情報を抽出 */
function extractA11y(document) {
  const found = [];
  walk(document, (node) => {
    const hasImage = (node.fills || []).some(f => f.type === 'IMAGE');
    if (!hasImage) return;
    let alt = '[TODO]';
    if (node.name.includes('alt:')) {
      alt = node.name.split('alt:')[1].trim();
    } else if (node.name.includes('@deco')) {
      alt = '(装飾画像 — alt="")';
    }
    found.push({ id: node.id, name: node.name, alt });
  });
  if (found.length === 0) {
    return '[INFO] 画像要素は検出されませんでした。';
  }
  const lines = ['### 画像のalt属性\n', '| ノード名 | alt候補 | ノードID |', '|---|---|---|'];
  for (const f of found) {
    lines.push(`| ${f.name} | ${f.alt} | \`${f.id}\` |`);
  }
  return lines.join('\n');
}

/** 再現困難パターンを検出 */
function extractHardToReproduce(document) {
  const issues = [];
  walk(document, (node) => {
    for (const effect of node.effects || []) {
      if (effect.type === 'BACKGROUND_BLUR' && effect.radius > 20) {
        issues.push(`- **${node.name}** (\`${node.id}\`): 強いBACKGROUND_BLUR (radius=${effect.radius}) — backdrop-filter で近似`);
      }
      if (effect.type === 'LAYER_BLUR' && effect.radius > 15) {
        issues.push(`- **${node.name}** (\`${node.id}\`): 強いLAYER_BLUR (radius=${effect.radius}) — filter: blur() で近似`);
      }
    }
    if (node.blendMode && !['PASS_THROUGH', 'NORMAL'].includes(node.blendMode)) {
      issues.push(`- **${node.name}** (\`${node.id}\`): 非標準blend-mode "${node.blendMode}" — mix-blend-mode で近似`);
    }
  });
  if (issues.length === 0) {
    return '再現困難なパターンは検出されませんでした。';
  }
  return issues.join('\n') + '\n\n[TODO] 各項目について、(a) 完全再現を試みる, (b) 代替表現に置き換える, (c) デザイナーに差し戻す のいずれかを決定してください。';
}

// ============================================================
// メイン
// ============================================================

(async () => {
  console.error(`Fetching Figma file ${FIGMA_FILE_KEY}...`);
  let fileData;
  if (NODE_ID) {
    const res = await figmaApi(`/v1/files/${FIGMA_FILE_KEY}/nodes?ids=${encodeURIComponent(NODE_ID)}`);
    fileData = { document: { children: Object.values(res.nodes).map(n => n.document) } };
  } else {
    fileData = await figmaApi(`/v1/files/${FIGMA_FILE_KEY}`);
  }

  if (fileData.err) {
    console.error(`Figma API error: ${fileData.err}`);
    process.exit(2);
  }

  console.error('Extracting design tokens...');
  const tokens = await extractDesignTokens(fileData);

  console.error('Extracting pages and sections...');
  const pages = extractPagesAndSections(fileData.document);
  const responsive = extractResponsive(fileData.document);
  const cms = extractCmsAreas(fileData.document);
  const images = extractImageExports(fileData.document);
  const a11y = extractA11y(fileData.document);
  const hardToReproduce = extractHardToReproduce(fileData.document);

  const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  const output = template
    .replace(/\{\{PROJECT_NAME\}\}/g, PROJECT_NAME)
    .replace(/\{\{GENERATED_AT\}\}/g, new Date().toISOString())
    .replace(/\{\{FIGMA_FILE_KEY\}\}/g, FIGMA_FILE_KEY)
    .replace(/\{\{DESIGN_TOKENS_TABLE\}\}/g, tokens)
    .replace(/\{\{PAGES_AND_SECTIONS\}\}/g, pages)
    .replace(/\{\{RESPONSIVE_SECTION\}\}/g, responsive)
    .replace(/\{\{A11Y_TABLE\}\}/g, a11y)
    .replace(/\{\{CMS_AREAS_TABLE\}\}/g, cms)
    .replace(/\{\{IMAGE_EXPORT_TABLE\}\}/g, images)
    .replace(/\{\{HARD_TO_REPRODUCE_LIST\}\}/g, hardToReproduce);

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, output);

  const todoCount = (output.match(/\[TODO\]/g) || []).length;
  console.error(`\nWrote: ${OUT_PATH}`);
  console.error(`TODO markers remaining: ${todoCount}（人が補完してください）`);
})().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(2);
});

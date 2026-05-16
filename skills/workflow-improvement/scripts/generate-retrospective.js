#!/usr/bin/env node
/**
 * generate-retrospective.js
 *
 * Visual Diff の結果と spec.md から、案件完了時の振り返り（retrospective.md）の下書きを生成する。
 * Claude Code が呼び出すことを想定。
 *
 * 使い方:
 *   node generate-retrospective.js \
 *     --project "○○高校コーポレートサイト" \
 *     --diff-report ./report/diff.json \
 *     --spec ./docs/spec.md \
 *     --structure-check ./report/structure-check.json \
 *     --duration 47 \
 *     --out ./retrospectives/202605-osaka-koukou.md
 *
 * 注: AI が後で「概要」「うまく行ったこと」「苦戦したこと」「教訓」のセクションを書き加えること。
 *     このスクリプトは「機械的に決まる部分」のみ埋める下書き生成器。
 */

const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'retrospective.md.template');

const args = process.argv.slice(2);
const getArg = (name, def = null) => {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : def;
};

const PROJECT = getArg('--project', '[案件名]');
const DIFF_REPORT_PATH = getArg('--diff-report', './report/diff.json');
const SPEC_PATH = getArg('--spec', './docs/spec.md');
const STRUCTURE_CHECK_PATH = getArg('--structure-check');
const DURATION_MIN = parseInt(getArg('--duration', '0'), 10) || 0;
const OUT_PATH = getArg('--out', './retrospective.md');

function safeReadJson(p) {
  if (!p || !fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function safeReadText(p) {
  if (!p || !fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf-8');
}

// spec.md から業種・CMS を抽出（簡易パーサ）
function extractFromSpec(specText) {
  if (!specText) return { industry: '[TODO]', cms: '[TODO]' };
  const industryMatch = specText.match(/\*\*業種\*\*[:：]\s*(.+)/);
  const cmsMatch = specText.match(/\*\*CMS\*\*[:：]\s*(.+)/);
  return {
    industry: industryMatch ? industryMatch[1].trim().split('/')[0].trim() : '[TODO]',
    cms: cmsMatch ? cmsMatch[1].trim().split('/')[0].trim() : '[TODO]',
  };
}

// 差分が大きかったターゲットを抽出（スコア低い順上位5件）
function pickStrugglingTargets(diffReport) {
  if (!diffReport || !diffReport.results) return [];
  return diffReport.results
    .filter(r => typeof r.score === 'number')
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map(r => ({
      id: r.id,
      label: r.label,
      viewport: r.viewport,
      score: r.score,
      threshold: r.threshold,
      pass: r.pass,
    }));
}

// 苦戦パターンを推測（ターゲット名から）
function inferStrugglingPatterns(targets) {
  const patterns = new Set();
  for (const t of targets) {
    const name = (t.label + ' ' + t.id).toLowerCase();
    if (name.includes('hero') || name.includes('background')) patterns.add('background-blur-strong');
    if (name.includes('title') || name.includes('heading')) patterns.add('fontWeight-rendering');
    if (name.includes('card') || name.includes('grid')) patterns.add('vertical-rhythm-gap');
    if (name.includes('form') || name.includes('contact')) patterns.add('form-field-styling');
    if (name.includes('nav') || name.includes('menu')) patterns.add('navigation-interaction');
  }
  return [...patterns];
}

// 推定原因を一言で（簡易）
function guessCause(target) {
  const name = (target.label + ' ' + target.id).toLowerCase();
  if (target.score >= target.threshold) return '閾値到達済み（参考）';
  if (name.includes('hero')) return '強いブラー効果の可能性';
  if (name.includes('title') || name.includes('heading')) return 'フォント描画差の可能性';
  if (name.includes('card')) return 'gap/margin の解釈差の可能性';
  return '[要分析]';
}

(async () => {
  const diffReport = safeReadJson(DIFF_REPORT_PATH);
  const specText = safeReadText(SPEC_PATH);
  const structureCheck = safeReadJson(STRUCTURE_CHECK_PATH);

  if (!diffReport) {
    console.error(`Error: diff report not found at ${DIFF_REPORT_PATH}`);
    process.exit(2);
  }

  const { industry, cms } = extractFromSpec(specText);
  const struggling = pickStrugglingTargets(diffReport);
  const patterns = inferStrugglingPatterns(struggling);

  // 反復回数は diff レポートには直接含まれない場合があるため、引数または環境変数で
  const iterations = parseInt(process.env.ITERATIONS || getArg('--iterations', '1'), 10);
  const maxIterations = parseInt(getArg('--max-iterations', '5'), 10);

  // 構造チェック結果からエラー/警告件数を取得
  const structErrors = structureCheck?.summary?.errors ?? 0;
  const structWarnings = structureCheck?.summary?.warnings ?? 0;

  const overallScore = diffReport.overallScore || 0;
  const passThreshold = diffReport.globalThreshold || 0.95;
  const passed = diffReport.pass || false;

  // テンプレート読み込み
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  // 苦戦ターゲットテーブル
  const strugglingTable = struggling.map(t =>
    `| ${t.label || t.id} | ${t.viewport} | ${(t.score * 100).toFixed(1)}% | ${guessCause(t)} |`
  ).join('\n') || '| (該当なし) | - | - | - |';

  const patternsYaml = patterns.map(p => `  - "${p}"`).join('\n') || '  []';

  const replacements = {
    PROJECT_NAME: PROJECT,
    DATE: new Date().toISOString().split('T')[0],
    INDUSTRY: industry,
    CMS: cms,
    FINAL_SCORE: overallScore.toFixed(4),
    FINAL_SCORE_PERCENT: (overallScore * 100).toFixed(1),
    PASS_THRESHOLD: passThreshold.toFixed(2),
    PASS_THRESHOLD_PERCENT: (passThreshold * 100).toFixed(1),
    ITERATIONS: iterations,
    MAX_ITERATIONS: maxIterations,
    PASSED: passed,
    VERDICT: passed ? '✓ PASS' : '✗ FAIL',
    DURATION_MIN: DURATION_MIN,
    STRUCTURE_CHECK_ERRORS: structErrors,
    STRUCTURE_CHECK_WARNINGS: structWarnings,
    STRUGGLING_PATTERNS_YAML: patternsYaml,
    STRUGGLING_TARGETS_TABLE: strugglingTable,
    GENERATED_AT: new Date().toISOString(),
    OVERVIEW: '[AI が補完: 案件規模、構成、結果を2-3文で要約してください]',
    WHAT_WORKED_WELL: '[AI が補完: 高再現率を達成した箇所、効いた工夫を3-5項目で記述]',
    WHAT_STRUGGLED: '[AI が補完: 差分が大きかった箇所、なぜ難しかったか、どう対処したかを記述]',
    LESSONS_LEARNED: '[AI が補完: 次回類似案件で活かしたい教訓を3-5項目で記述]',
    RULE_IMPROVEMENT_HINTS: '[AI が補完: 構造チェックルールに追加すべき項目、調整すべき閾値を記述（気づきがなければ「なし」と記入）]',
  };

  let output = template;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, output);

  console.error(`Wrote: ${OUT_PATH}`);
  console.error('\n次のステップ:');
  console.error('1. Claude Code がこのファイルを開き、[AI が補完] のセクションを埋める');
  console.error('2. コーダーが [CODER NOTE] セクションを5-10分で埋める');
  console.error('3. retrospectives/ にコミット');
})();

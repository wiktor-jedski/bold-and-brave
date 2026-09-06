import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const inputs = {
  plan: ['docs/implementation/plan.md'],
  content: ['src/content/catalog.ts'],
  controls: ['src/core/types.ts', 'src/browser/input.ts'],
  panels: ['src/browser/ui.ts', 'src/main.ts'],
  checkpoints: ['src/scenarios/catalog.ts'],
};
const rules = [
  ['PVS-OOS-001', 'Implementation details belong outside the normative handoff', /\b(?:phase tickets?|task order|file layouts?|class designs?|implementation schedule)\b/i],
  ['PVS-OOS-002', 'No alternate interception terrain or river crossing', /\b(?:open approach(?: interception)?|alternate (?:river )?crossings?|second (?:bridge|crossing)|another river crossing)\b/i],
  ['PVS-OOS-003', 'No raider-aligned playable path', /\b(?:join|help|aid|side with|ally with|support) (?:the )?(?:raiders|bandits)\b/i],
  ['PVS-OOS-004', 'No additional locations, economies, activities or weapon roles', /\b(?:additional overworld locations?|more overworld locations?|second settlement|covert operations?|trade simulation|trade routes?|camping|tournaments?|nicknames?|horses?|vehicles?|siege equipment|bows?|axes|pikes?)\b/i],
  ['PVS-OOS-005', 'No expanded Band, political or settlement systems', /\b(?:large armies|diplomacy|delegated companion work|stewards?|troop education|troop progression|custom troops?|quirks?|multiple local contracts?|resident daily schedules?|daily routines?)\b/i],
  ['PVS-OOS-006', 'No morale, retention or provision penalties', /\b(?:band morale|morale|retention|missing provisions? penalties|provisions? penalt(?:y|ies)|camping needs|entertainment)\b/i],
  ['PVS-OOS-007', 'No expanded Captive systems', /\b(?:captive management|ransom|forced labo[u]?r|enslavement|recruit(?:ment of)? captives?|captive recruit(?:ment)?|captive trade|sell captives?)\b/i],
  ['PVS-OOS-008', 'No account, backend or multiplayer dependency', /\b(?:multiplayer|accounts?|backend services?|server owned (?:gameplay )?state|cloud saves?|online synchroni[sz]ation|sign in|log in)\b/i],
  ['PVS-OOS-009', 'No runtime generation, voice dialogue or adaptive score', /\b(?:runtime generative ai|runtime (?:asset|content) generation|spoken dialogue|speech synthesis|adaptive (?:music|score))\b/i],
  ['PVS-OOS-010', 'No excluded rendering or expanded support promise', /\b(?:webgl (?:rendering )?fallback|software rendering|mobile support|touch controls|keyboard only support|reduced motion support|(?:firefox|safari|edge|webgl|mobile|touch) support|support(?:s|ed)? (?:firefox|safari|edge|mobile|touch))\b/i],
  ['PVS-OOS-011', 'No broader progression, relationship scores or contract retry', /\b(?:renown behavior|renown (?:gain|reward|level)|broad progression tree|skill tree|agent relationship scores?|relationship scores?|shared faction attitude|faction reputation|partial settlement damage|contract retry|retry (?:the )?(?:local )?contract|agent grievance removal|remove grievances?|clear grievances?)\b/i],
];
const normalize = text => text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_‐‑–—-]+/g, ' ').replace(/\s+/g, ' ').trim();

function denied(clause, match) {
  const before = clause.slice(0, match.index);
  const after = clause.slice(match.index + match[0].length);
  return /\b(?:no|not|never|without|exclude[sd]?|forbid(?:den)?|reject(?:s|ed)?|outside (?:the )?(?:slice|scope)|out of scope|unavailable)\b/i.test(before)
    || /^\s+(?:is|are|remains?)\s+(?:not |never )?(?:unavailable|excluded|forbidden|unsupported|disabled|outside)\b/i.test(after)
    || /^\s+(?:cannot|must not|does not|is not|are not)\b/i.test(after);
}

function fragments(path, text, surface) {
  if (!/\.[cm]?[jt]sx?$/.test(path)) return text.split('\n').map((text, line) => ({ text, line: line + 1, affordance: false }));
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length) throw new Error(`${path}: ${ts.flattenDiagnosticMessageText(source.parseDiagnostics[0].messageText, ' ')}`);
  const found = [];
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      let parent = node.parent;
      while (parent && !ts.isCallExpression(parent) && !ts.isPropertyAssignment(parent) && !ts.isVariableDeclaration(parent)) parent = parent.parent;
      const call = parent && ts.isCallExpression(parent) ? parent.expression.getText(source) : '';
      // Negative descriptions are valid; a disabled/placeholder control for an excluded system is not.
      const affordance = surface === 'panels' && (/\.(?:button|action|section)$/.test(call) || /<(?:button|input|select|option)\b/i.test(node.text));
      found.push({ text: node.text, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, affordance });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

export function auditScope(sources, specification) {
  const errors = [];
  const expected = rules.map(([id]) => id);
  const exclusions = [...specification.matchAll(/^\| (PVS-OOS-\d{3}) \| OUT OF SCOPE \|/gm)].map(match => match[1]);
  if (JSON.stringify(exclusions) !== JSON.stringify(expected)) errors.push('Normative specification must contain exactly the eleven ordered PVS-OOS rows.');
  const inspections = {};
  for (const surface of Object.keys(inputs)) {
    const files = sources[surface];
    if (!Array.isArray(files) || files.length === 0) { errors.push(`${surface}: required audit input is missing.`); inspections[surface] = []; continue; }
    inspections[surface] = [];
    for (const file of files) {
      if (!file.text?.trim()) { errors.push(`${surface}: ${file.path} is empty.`); continue; }
      try {
        const extracted = fragments(file.path, file.text, surface);
        if (extracted.length === 0) errors.push(`${surface}: ${file.path} contains no inspectable declarations or text.`);
        inspections[surface].push(...extracted.map(fragment => ({ ...fragment, path: file.path })));
      } catch (error) { errors.push(String(error)); }
    }
  }
  const content = sources.content?.map(file => file.text).join('\n') ?? '';
  const catalog = ts.createSourceFile('catalog.ts', content, ts.ScriptTarget.Latest, true);
  const declarations = new Map();
  function collect(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node.initializer);
    ts.forEachChild(node, collect);
  }
  collect(catalog);
  for (const [name, count] of [['CANDIDATES', 4], ['AGENTS', 3], ['FEATS', 3], ['LOADOUTS', null], ['WORLD', null], ['CONTRACT', null]]) {
    let value = declarations.get(name);
    while (value && (ts.isCallExpression(value) || ts.isAsExpression(value) || ts.isParenthesizedExpression(value))) value = ts.isCallExpression(value) && value.expression.getText(catalog) === 'Object.freeze' ? value.arguments[0] : value.expression;
    if (count !== null) {
      if (!value || !ts.isArrayLiteralExpression(value) || value.elements.length !== count) errors.push(`Content ${name} must have exactly ${count} authored entries; missing or empty catalogs cannot establish scope.`);
    } else if (!value || !ts.isObjectLiteralExpression(value) || value.properties.length === 0) errors.push(`Content ${name} must contain authored object data; empty declarations cannot establish scope.`);
  }
  const controls = sources.controls?.map(file => file.text).join('\n') ?? '';
  if (!/export type Command\s*=/.test(controls) || !/addEventListener/.test(controls)) errors.push('Controls input lacks the public Command union or actual browser event controls.');
  const panels = sources.panels?.map(file => file.text).join('\n') ?? '';
  if (!/class GameUI\b/.test(panels) || !/createElement/.test(panels) || !/Journal/.test(panels)) errors.push('Panel input lacks the actual nonempty DOM UI; a stub cannot establish scope.');
  const checkpointText = sources.checkpoints?.map(file => file.text).join('\n') ?? '';
  const declaredCheckpoints = new Set([...checkpointText.matchAll(/['"](CP-[A-Z-]+)['"]/g)].map(match => match[1]));
  const normativeCheckpoints = new Set([...specification.matchAll(/^\| `(CP-[A-Z-]+)` \|/gm)].map(match => match[1]));
  const declaredScenarios = new Set([...checkpointText.matchAll(/['"](SCN-\d{2}-[A-Z-]+)['"]/g)].map(match => match[1]));
  if (declaredCheckpoints.size !== 30 || declaredScenarios.size !== 20 || !/export const CHECKPOINTS\b/.test(checkpointText) || !/export const SCENARIOS\b/.test(checkpointText)) errors.push('Checkpoint catalog must declare all 30 checkpoints and 20 named scenarios, not an empty or partial list.');
  for (const id of declaredCheckpoints) if (!normativeCheckpoints.has(id)) errors.push(`Unspecified acceptance checkpoint: ${id}.`);
  for (const id of normativeCheckpoints) if (!declaredCheckpoints.has(id)) errors.push(`Missing required checkpoint: ${id}.`);
  const results = rules.map(([id, description, pattern]) => {
    const surfaces = Object.entries(inspections).map(([surface, records]) => {
      const matches = [];
      const excludedMentions = [];
      for (const record of records) {
        // PVS-OOS-001 confines implementation detail in the specification, not the existence of a separate implementation plan or TypeScript classes.
        if (id === 'PVS-OOS-001' && surface !== 'plan') continue;
        for (const segment of normalize(record.text).split(/(?<=[.!?;])\s+|\s+but\s+/i)) {
          const match = pattern.exec(segment);
          if (!match) continue;
          const detail = { path: record.path, line: record.line, text: segment, matched: match[0] };
          if (!record.affordance && denied(segment, match)) excludedMentions.push(detail);
          else matches.push(detail);
        }
      }
      return { surface, status: records.length === 0 ? 'blocked' : matches.length ? 'failed' : 'passed static exclusion scan', inspectedFragments: records.length, violations: matches, explicitExclusions: excludedMentions, ...(id === 'PVS-OOS-001' ? { interpretation: 'Separate implementation planning is allowed; this exclusion does not prohibit source file/class existence.' } : {}) };
    });
    return { id, description, status: surfaces.some(surface => surface.status === 'failed' || surface.status === 'blocked') ? 'failed' : 'passed static exclusion scan', surfaces };
  });
  // Implementation details must not have leaked into normative in-scope requirement rows.
  const implementationPattern = rules[0][2];
  const normativeLeaks = specification.split('\n').filter(line => /^\| PVS-/.test(line) && !/^\| PVS-OOS-/.test(line)).filter(line => {
    const clause = normalize(line); const match = implementationPattern.exec(clause); return match && !denied(clause, match);
  });
  if (normativeLeaks.length) errors.push(`Implementation details leaked into normative requirements: ${normativeLeaks.join('\n')}`);
  return { eligible: errors.length === 0 && results.every(result => result.status === 'passed static exclusion scan'), errors, exclusions: results, limitations: ['Static audit of concrete plan/catalog/control/panel/checkpoint inputs; it does not prove arbitrary dynamic gameplay absence or representative quality.', 'Negative prohibitions in source prose are ignored; excluded feature labels in controls are rejected even if disabled.'] };
}

export function selfCheckScope(sources, specification) {
  const failures = [];
  const examples = ['Add an implementation schedule.', 'Add an alternate river crossing.', 'Help the raiders.', 'Add tournaments.', 'Add Troop progression.', 'Add Band morale.', 'Add ransom.', 'Add multiplayer.', 'Add spoken dialogue.', 'Add mobile support.', 'Add contract retry.'];
  for (let index = 0; index < rules.length; index++) {
    const mutated = structuredClone(sources);
    mutated.plan.push({ path: 'injected-plan.txt', text: examples[index] });
    if (auditScope(mutated, specification).exclusions[index].status !== 'failed') failures.push(`Positive exclusion fixture escaped ${rules[index][0]}.`);
    mutated.plan[mutated.plan.length - 1].text = `Do not ${examples[index].replace(/^Add |^Help /, value => value.toLowerCase())}`;
    const negative = auditScope(mutated, specification).exclusions[index].surfaces.find(surface => surface.surface === 'plan');
    if (negative.violations.some(match => match.path === 'injected-plan.txt')) failures.push(`Negative prose false positive for ${rules[index][0]}.`);
  }
  const empty = { ...sources, content: [] };
  if (auditScope(empty, specification).eligible) failures.push('Missing content catalog incorrectly accepted.');
  const affordance = structuredClone(sources);
  affordance.panels.push({ path: 'injected-ui.ts', text: 'ui.button("Multiplayer unavailable", "multiplayer", () => {}, true);' });
  if (auditScope(affordance, specification).exclusions[7].status !== 'failed') failures.push('Disabled excluded affordance incorrectly accepted.');
  return { passed: failures.length === 0, failures };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sources = {};
  const readErrors = [];
  for (const [surface, paths] of Object.entries(inputs)) {
    sources[surface] = [];
    for (const path of paths) {
      try { sources[surface].push({ path, text: readFileSync(path, 'utf8') }); }
      catch (error) { readErrors.push(`${surface}: cannot read ${path}: ${error.message}`); }
    }
  }
  let specification = '';
  try { specification = readFileSync('.scratch/playable-vertical-slice/spec.md', 'utf8'); }
  catch (error) { readErrors.push(`Cannot read normative specification: ${error.message}`); }
  const result = auditScope(sources, specification);
  result.errors.unshift(...readErrors);
  result.eligible &&= readErrors.length === 0;
  if (process.argv.includes('--self-check')) {
    result.selfCheck = selfCheckScope(sources, specification);
    result.eligible &&= result.selfCheck.passed;
  }
  result.specificationHash = createHash('sha256').update(specification).digest('hex');
  result.inputs = Object.fromEntries(Object.entries(sources).map(([surface, files]) => [surface, files.map(file => ({ path: file.path, sha256: createHash('sha256').update(file.text).digest('hex') }))]));
  const outputIndex = process.argv.indexOf('--output');
  const output = outputIndex < 0 ? 'test-results/scope-audit.json' : process.argv[outputIndex + 1];
  if (!output || output.startsWith('--')) throw new Error('--output requires a JSON file path.');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Excluded-scope audit: ${result.eligible ? 'PASS (static inputs only)' : 'FAIL'}; report ${output}`);
  for (const error of result.errors) console.error(error);
  for (const rule of result.exclusions) for (const surface of rule.surfaces) for (const violation of surface.violations) console.error(`${rule.id} ${violation.path}:${violation.line}: ${violation.text}`);
  if (!result.eligible) process.exitCode = 1;
}

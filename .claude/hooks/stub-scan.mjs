#!/usr/bin/env node
// stub-scan.mjs — PostToolUse hook that refuses to ship high-confidence
// stub patterns inside files just written/edited by Claude.
//
// Wired into .claude/settings.json under PostToolUse matcher "Write|Edit"
// alongside post-edit.mjs + posttool-roadmap-render.mjs. Catches the
// obvious "function returns 'TODO'" failure mode within the same step the
// agent introduced it, so the agent self-corrects without burning the rest
// of the cycle's tokens. Step 8.5's story-acceptance-check.mjs catches
// subtler patterns + files written by scripts (not the Edit/Write tool).
//
// Exits non-zero (1) on a stub hit — fails the tool call. The agent's
// next turn sees stderr with the file:line + the Tier 1 stub-policy
// reminder. False positives are kept low by using tight regex on
// high-confidence patterns only.
//
// Reads the tool-use payload from stdin (same shape as post-edit.mjs).
// Silent if file is not a code extension, lives under a test/spec/mock
// path, or doesn't exist on disk.

import { readFileSync, existsSync } from 'node:fs';

// File extensions the scan applies to. Markdown, JSON, YAML, and other
// non-code files are exempt — Tier 1 stub policy is about CODE, not docs.
const CODE_EXTS = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs)$/;

// Path exemptions: test fixtures, mocks, intentional placeholders.
const SKIP_PATH = /(\.test\.|\.spec\.|\.mock\.|__tests__|\/fixtures\/|\/mocks?\/)/i;

// High-confidence stub patterns. Tighten = fewer false positives + fewer
// catches. story-acceptance-check.mjs has the looser regex layer for
// final-gate scanning. Each entry: { re, label }.
const PATTERNS = [
  {
    re: /['"`](Coming soon|TBD|lorem ipsum|placeholder text|placeholder string)['"`]/gi,
    label: 'placeholder string literal',
  },
  {
    re: /['"`][^'"`]*\(stub\)[^'"`]*['"`]/gi,
    label: '(stub) annotation in string literal',
  },
  {
    re: /throw\s+new\s+Error\s*\(\s*['"`](not implemented|TODO|stub|TBD)['"`]\s*\)/gi,
    label: 'not-implemented throw',
  },
  {
    // TODO/FIXME/XXX comments without a (TASK-NNN) reference. Permits the
    // documented escape hatch: // TODO(TASK-042): explain.
    re: /\b(TODO|FIXME|XXX)\b(?!\s*\(TASK-\d+\))/g,
    label: 'TODO/FIXME without TASK-id',
  },
];

function readStdinJSON() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { buf += c; });
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(buf)); }
      catch { resolve(null); }
    });
    setTimeout(() => resolve(null), 500);
  });
}

async function main() {
  const payload = await readStdinJSON();
  const filePath = payload?.tool_input?.file_path || payload?.tool_response?.filePath;
  if (!filePath) process.exit(0);
  if (!CODE_EXTS.test(filePath)) process.exit(0);
  if (SKIP_PATH.test(filePath)) process.exit(0);
  if (!existsSync(filePath)) process.exit(0);

  let content;
  try { content = readFileSync(filePath, 'utf8'); }
  catch { process.exit(0); }

  const hits = [];
  for (const { re, label } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      const before = content.slice(0, m.index);
      const lineNum = before.split('\n').length;
      const lineStart = before.lastIndexOf('\n') + 1;
      const lineEnd = content.indexOf('\n', m.index);
      const lineText = content.slice(lineStart, lineEnd < 0 ? content.length : lineEnd).trim();
      hits.push({ label, lineNum, lineText, snippet: m[0] });
      if (re.global !== true) break;
    }
  }

  if (hits.length === 0) process.exit(0);

  process.stderr.write('[stub-scan] STUB DETECTED — refusing to ship placeholder code:\n');
  for (const h of hits.slice(0, 10)) {
    process.stderr.write(`  ${filePath}:${h.lineNum}  ${h.label}\n    ${h.lineText}\n`);
  }
  if (hits.length > 10) {
    process.stderr.write(`  ... and ${hits.length - 10} more\n`);
  }
  process.stderr.write(
    '\nPer AGENTS.md Tier 1 stub policy:\n' +
    '  - Replace with a real implementation, OR\n' +
    '  - Add follow-up tasks via `node scripts/roadmap-followup.mjs <TASK> --add-tasks "..."`\n' +
    '    and continue WITHOUT the stub, OR\n' +
    '  - Mark the task blocked if the gap requires user input.\n' +
    'TODO/FIXME comments are allowed only when they reference a TASK-NNN that\n' +
    'exists in the roadmap, e.g. `// TODO(TASK-042): wire up after auth lands`.\n'
  );
  process.exit(1);
}

main().catch((e) => {
  // Hook bugs should not block the cycle — emit warning and exit 0.
  process.stderr.write(`[stub-scan] internal error (non-fatal): ${e.message}\n`);
  process.exit(0);
});

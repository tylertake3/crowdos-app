#!/usr/bin/env node
/**
 * ratchet.mjs — let known problems stay, stop new ones arriving.
 *
 * ─── THE MECHANISM, IN ONE PARAGRAPH ──────────────────────────────────────────
 * This repo has two piles of pre-existing findings that are real but not worth
 * a big-bang fix: ~417 loose-DOM type errors in `lib/board/*.js` (reported by
 * `tsconfig.checkjs.json`) and ~93 lint warnings in the same legacy board code.
 * Fixing them all is days of work with a live production on the line. Ignoring
 * them means they quietly grow. So instead we COUNT them, commit the count to
 * `scripts/baselines/quality-baseline.json`, and have CI re-count on every push.
 * If the number goes UP, CI fails: you added a new one. If it goes DOWN, CI
 * passes and tells you to commit the lower number, which permanently lowers the
 * ceiling. The count can therefore only ever go down. That is the whole idea —
 * a one-way valve, not a fix.
 *
 * ─── USAGE ────────────────────────────────────────────────────────────────────
 *   node scripts/ratchet.mjs               check everything (what CI runs)
 *   node scripts/ratchet.mjs --update      re-record the current counts
 *   node scripts/ratchet.mjs eslint        check just one check
 *
 * ─── WHEN CI FAILS ON THIS ────────────────────────────────────────────────────
 * You are not being asked to fix the 417. You are being asked to not add a
 * 418th. Run the underlying command (printed in the failure) and look at the
 * findings in the file you just touched.
 *
 * ─── WHEN YOU LEGITIMATELY NEED THE NUMBER TO GO UP ───────────────────────────
 * Rare — a TypeScript or ESLint upgrade can add new checks that legitimately
 * find more. Then run `node scripts/ratchet.mjs --update` and commit the
 * baseline change ON ITS OWN, with a message saying which upgrade caused it, so
 * it is visible in review rather than buried in a feature diff.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(ROOT, 'scripts', 'baselines', 'quality-baseline.json');

/**
 * Each check runs a command and reduces its output to counts. Counts are
 * per-severity so that a legacy warning being fixed can never "pay for" a new
 * hard error somewhere else — the two ceilings drop independently.
 */
const CHECKS = {
  'typecheck-js': {
    label: 'Board JS type-check (tsconfig.checkjs.json)',
    describe: 'npm run typecheck:js',
    run: () =>
      spawnSync(
        'npx',
        ['tsc', '-p', 'tsconfig.checkjs.json', '--pretty', 'false'],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      ),
    // tsc --pretty false emits one line per error: path(line,col): error TSxxxx: msg
    count: (res) => {
      const lines = `${res.stdout || ''}\n${res.stderr || ''}`.split('\n');
      const errors = lines.filter((l) =>
        /^\S.*\(\d+,\d+\): error TS\d+:/.test(l),
      ).length;
      // A tsc run that produced no parseable error lines but still failed means
      // the config itself is broken (bad path, missing file). Do not silently
      // record that as "0 errors, great news".
      if (errors === 0 && res.status !== 0) {
        throw new Error(
          `tsc exited ${res.status} but produced no error lines — the config is ` +
            `probably broken rather than clean.\n${res.stdout}\n${res.stderr}`,
        );
      }
      return { errors };
    },
  },

  eslint: {
    label: 'ESLint',
    describe: 'npm run lint',
    run: () =>
      spawnSync('npx', ['eslint', '.', '--format', 'json'], {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      }),
    count: (res) => {
      let report;
      try {
        report = JSON.parse(res.stdout);
      } catch {
        throw new Error(
          `ESLint did not produce JSON — it probably crashed.\n${res.stderr || res.stdout}`,
        );
      }
      let errors = 0;
      let warnings = 0;
      for (const file of report) {
        errors += file.errorCount ?? 0;
        warnings += file.warningCount ?? 0;
      }
      return { errors, warnings };
    },
  },
};

// ── Where the findings actually are, so a failure message can point at them ──
function topOffenders(res, checkName) {
  if (checkName !== 'eslint') return '';
  try {
    const report = JSON.parse(res.stdout);
    const rows = report
      .filter((f) => f.errorCount || f.warningCount)
      .sort((a, b) => b.errorCount + b.warningCount - (a.errorCount + a.warningCount))
      .slice(0, 8)
      .map(
        (f) =>
          `      ${f.errorCount} error(s) ${f.warningCount} warning(s)  ${f.filePath.replace(ROOT + '/', '')}`,
      );
    return rows.length ? `\n${rows.join('\n')}` : '';
  } catch {
    return '';
  }
}

function readBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    return { checks: {} };
  }
}

function writeBaseline(baseline) {
  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  // JSON cannot carry comments, and this file will be read by someone staring
  // at a failed CI run wondering what it is. Put the explanation inside it.
  const withReadme = {
    _readme: [
      'Committed counts of KNOWN, PRE-EXISTING problems. CI (.github/workflows/ci.yml)',
      're-counts them on every push via `npm run ratchet` and fails if a number went UP.',
      'You are never asked to fix the existing ones — only to not add another.',
      'If a count went DOWN, the ratchet lowers it here automatically; commit this file.',
      'Do not hand-edit these numbers. Run `npm run ratchet:update` instead, and commit',
      'that on its own with a note saying why (normally a tooling upgrade).',
      'Full explanation: scripts/ratchet.mjs',
    ],
    ...baseline,
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(withReadme, null, 2)}\n`);
}

const args = process.argv.slice(2);
const update = args.includes('--update');
const requested = args.filter((a) => !a.startsWith('--'));
const names = requested.length ? requested : Object.keys(CHECKS);

for (const name of names) {
  if (!CHECKS[name]) {
    console.error(
      `Unknown check "${name}". Known checks: ${Object.keys(CHECKS).join(', ')}`,
    );
    process.exit(2);
  }
}

const baseline = readBaseline();
baseline.checks ??= {};
let failed = false;
let lowered = false;

for (const name of names) {
  const check = CHECKS[name];
  process.stdout.write(`▸ ${check.label} … `);

  const res = check.run();
  if (res.error) {
    console.log('CRASHED');
    console.error(`  Could not run the check: ${res.error.message}`);
    failed = true;
    continue;
  }

  let counts;
  try {
    counts = check.count(res);
  } catch (err) {
    console.log('CRASHED');
    console.error(`  ${err.message}`);
    failed = true;
    continue;
  }

  const previous = baseline.checks[name]?.counts;

  if (update || !previous) {
    baseline.checks[name] = {
      counts,
      command: check.describe,
      recorded: new Date().toISOString().slice(0, 10),
    };
    console.log(
      `recorded ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`,
    );
    continue;
  }

  // Compare every severity bucket independently.
  const regressions = [];
  const improvements = [];
  for (const [severity, current] of Object.entries(counts)) {
    const allowed = previous[severity] ?? 0;
    if (current > allowed) regressions.push({ severity, current, allowed });
    else if (current < allowed) improvements.push({ severity, current, allowed });
  }

  if (regressions.length) {
    console.log('REGRESSED');
    for (const r of regressions) {
      console.error(
        `  ✗ ${r.severity}: ${r.current} now, baseline allows ${r.allowed} ` +
          `(+${r.current - r.allowed} new)`,
      );
    }
    console.error(`    Reproduce with: ${check.describe}`);
    console.error(
      `    You do NOT have to fix the pre-existing ${Object.values(previous).join('/')} — ` +
        `only the ones your change added.` + topOffenders(res, name),
    );
    failed = true;
    continue;
  }

  if (improvements.length) {
    lowered = true;
    console.log('IMPROVED');
    for (const i of improvements) {
      console.log(
        `  ✓ ${i.severity}: ${i.current} (was ${i.allowed}) — ${i.allowed - i.current} fixed`,
      );
    }
    // Lower the ceiling automatically in the working copy; CI still passes, and
    // the diff is there for the author to commit.
    baseline.checks[name].counts = counts;
    baseline.checks[name].recorded = new Date().toISOString().slice(0, 10);
  } else {
    console.log(
      `unchanged (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')})`,
    );
  }
}

// Only rewrite the baseline when the whole run is healthy. If one check
// regressed and another improved, writing the improvement would lower the
// ceiling on a run the author is about to fix and re-run — so their second
// attempt fails against a number that moved under them. Fix first, then the
// improvement is recorded on the passing run.
if (update || (lowered && !failed)) writeBaseline(baseline);

if (update) {
  console.log(`\nBaseline written to ${BASELINE_PATH.replace(ROOT + '/', '')}. Commit it.`);
} else if (lowered && !failed) {
  console.log(
    `\nThe baseline in ${BASELINE_PATH.replace(ROOT + '/', '')} has been LOWERED to match.` +
      `\nCommit that file with your change so the improvement is locked in.`,
  );
}

process.exit(failed ? 1 : 0);

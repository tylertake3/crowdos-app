// ESLint configuration for CrowdOS.
//
// GOAL: catch the specific class of mistake that a human review of this repo
// found by hand — variables declared and never used, code after a `return`,
// references to names that do not exist, `catch {}` blocks that swallow a real
// failure, and promises nobody awaits. NOT to impose a style guide. There are
// no formatting rules here on purpose; nothing in this file will ever tell you
// where to put a brace.
//
// THE TWO-TIER SHAPE (this is the important bit):
//
//   Tier 1 — TypeScript (lib/engine, app, tests, scripts): rules are ERRORS.
//     This code is small, modern and already clean, so a real error means
//     somebody just broke something. `npm run lint` fails the build on these.
//
//   Tier 2 — the legacy board (lib/board/*.js): the same rules are WARNINGS,
//     and the count is RATCHETED (see scripts/ratchet.mjs). app.js is ~14k
//     lines ported near-verbatim from prototype_1.html and carries a
//     `/* eslint-disable */` at the top. Erroring here would mean ~hundreds of
//     failures on day one and the owner would (correctly) delete this file.
//     Instead the warnings are counted; CI fails only if the count goes UP.
//
// WHY `noInlineConfig` FOR THE BOARD: lib/board/app.js and cloud.js each begin
// with `/* eslint-disable */`, which would make ESLint skip them entirely and
// report a proud, meaningless zero. `linterOptions.noInlineConfig: true` makes
// ESLint ignore those comments so the files are actually linted. It is scoped
// to lib/board only — inline disables everywhere else still work normally.
//
// RUN IT:  npm run lint     the full report (exits non-zero on tier-1 errors)
//          npm run ratchet  the CI gate: fails only if a count went UP
//
// ⚠️ WHY `build` AND `build:check` PASS `--no-lint`:
// The moment this file exists, `next build` starts running ESLint as part of
// the build and FAILS the build on any error. That would mean a stray unused
// variable blocks a Vercel production deploy — at 11pm, with a producer
// waiting. Linting belongs in CI, where it is informative, not in the deploy
// path, where it is an outage. So both build scripts in package.json disable
// Next's built-in lint step and `.github/workflows/ci.yml` runs the linter
// separately. Do not remove `--no-lint` without moving that gate somewhere.

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** The rules we actually care about, shared by both tiers. */
const HIGH_VALUE_RULES = {
  // Declared and never used. The single highest-signal rule in this repo:
  // an unused variable is usually a rename that only got half-applied, or a
  // computed value that was supposed to be returned.
  'no-unused-vars': [
    'error',
    {
      args: 'after-used',
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrors: 'none', // `catch (e)` with an unused `e` is idiomatic here
      ignoreRestSiblings: true,
    },
  ],
  // Code after return/throw/break. Always a bug, never intentional.
  'no-unreachable': 'error',
  // Typos and missing imports. Only meaningful with the right globals
  // declared, which is why each tier below sets its own `languageOptions`.
  'no-undef': 'error',
  // `catch {}` — a failure that happens and nobody ever finds out. `allowEmptyCatch`
  // is deliberately NOT set; if a catch is genuinely a no-op it needs a comment
  // inside it saying so, which is one keystroke and answers the reviewer's question.
  'no-empty': ['error', { allowEmptyCatch: false }],
  // A stray `foo === bar;` on its own line: a comparison whose result is thrown
  // away, usually a `=` that was meant to be there.
  'no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
  // `if (x = 1)` — assignment where a comparison was meant. Left on the default
  // `except-parens` so the idiomatic `while ((m = re.exec(s)))` used all over
  // lib/engine/parser.ts stays legal; the bare, accidental form is still caught.
  'no-cond-assign': ['error', 'except-parens'],
  // Two object keys / two class members with the same name: the second silently
  // wins. Easy to introduce in a 14k-line file, impossible to spot by eye.
  'no-dupe-keys': 'error',
  'no-dupe-class-members': 'error',
  'no-dupe-args': 'error',
  'no-duplicate-case': 'error',
  // Redeclaring a function shadows the first one. Same failure mode.
  'no-func-assign': 'error',
  // `await` inside a loop condition, comparisons against NaN, sparse arrays.
  'use-isnan': 'error',
  'no-sparse-arrays': 'error',
  // Reassigning a `const`-like import, or `class`.
  'no-class-assign': 'error',
  'no-const-assign': 'error',
  // Fall-through between switch cases without a comment.
  'no-fallthrough': 'error',
  // `return` inside a `finally` silently discards the exception.
  'no-unsafe-finally': 'error',
  // Optional-chaining result used where it can be undefined at runtime.
  'no-unsafe-optional-chaining': 'error',
  // A promise-returning function used as the argument to `new Promise`, etc.
  'no-async-promise-executor': 'error',
  // Comparing typeof against a string that is not a real type ("bolean").
  'valid-typeof': ['error', { requireStringLiterals: true }],
};

/** Same rules, demoted to warnings, for the ratcheted legacy tier. */
const asWarnings = Object.fromEntries(
  Object.entries(HIGH_VALUE_RULES).map(([rule, setting]) => [
    rule,
    Array.isArray(setting) ? ['warn', ...setting.slice(1)] : 'warn',
  ]),
);

export default [
  // ── What ESLint must never look at ────────────────────────────────────────
  // prototype_1.html's extracted JS, build output, and vendored bundles are not
  // ours to fix. `.next-check` in particular is a full second copy of the build.
  {
    ignores: [
      '.next/**',
      '.next-check/**',
      'node_modules/**',
      'out/**',
      'build/**',
      'backups/**',
      'public/**',
      'coverage/**',
      'next-env.d.ts',
      '*.min.js',
    ],
  },

  // ── Tier 1: TypeScript — errors ───────────────────────────────────────────
  ...tseslint.config({
    files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        // Type-aware linting. Required for no-floating-promises: without type
        // information ESLint cannot know that a call returns a Promise. This is
        // the slowest part of the run (a few seconds) and it is worth it —
        // an un-awaited write to Supabase is exactly how a user loses work.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...HIGH_VALUE_RULES,
      // The TS-aware versions supersede the core ones for TS files: they
      // understand type-only imports, enums, parameter properties, overloads.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': HIGH_VALUE_RULES['no-unused-vars'],
      'no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-expressions':
        HIGH_VALUE_RULES['no-unused-expressions'],
      'no-dupe-class-members': 'off',
      // TypeScript already reports undefined identifiers, and far better than
      // ESLint can. Leaving no-undef on for TS is a known false-positive source
      // (it does not understand `declare global`, ambient types, or generics).
      'no-undef': 'off',

      // ── The floating-promise rules: the reason type-aware linting is on ──
      '@typescript-eslint/no-floating-promises': [
        'error',
        { ignoreVoid: true, ignoreIIFE: true },
      ],
      // A promise passed where a void callback is expected, e.g.
      // `onClick={async () => ...}` or `arr.filter(async x => ...)`. The second
      // one always "works" and is always wrong.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: false, checksConditionals: true },
      ],
      // `await` on something that is not a promise usually means a missing call.
      '@typescript-eslint/await-thenable': 'error',

      // ── Deliberately relaxed ──────────────────────────────────────────────
      // This codebase uses `any` at the boundaries where AI output and
      // spreadsheet rows arrive untyped. Erroring on it would produce hundreds
      // of findings that are all the same conscious decision.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      // Style, not correctness. `prefer-const` and `no-useless-escape` between
      // them accounted for ~17 of the first 52 findings, every one of them
      // harmless — exactly the "thousands of pre-existing warnings" failure
      // mode this config is meant to avoid. The regex escapes in parser.ts are
      // redundant but deliberate and readable.
      'prefer-const': 'off',
      'no-useless-escape': 'off',
    },
  }),

  // Tests: same rules, but non-null assertions and long setup blocks are fine.
  {
    files: ['tests/**/*.ts', 'scripts/**/*.test.ts', '**/*.test.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-expressions': 'off', // assertion libraries
    },
  },

  // ── Tier 2: the legacy board — warnings, ratcheted ────────────────────────
  {
    files: ['lib/board/*.js'],
    linterOptions: {
      // See the header: this is what makes the `/* eslint-disable */` at the
      // top of app.js and cloud.js stop hiding the whole file.
      noInlineConfig: true,
      reportUnusedDisableDirectives: false,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module', // app.js/cloud.js/tour.js are ES modules despite the name
      globals: {
        ...globals.browser,
        // Globals the board genuinely relies on and that the browser list does
        // not know about. Without these, no-undef is pure noise.
        supabase: 'readonly',
        XLSX: 'readonly',
        ExcelJS: 'readonly',
        jspdf: 'readonly',
        jsPDF: 'readonly',
        pdfjsLib: 'readonly',
        CrowdOS: 'writable',
        __crowdos: 'writable',
        process: 'readonly',
        module: 'writable',
        require: 'readonly',
        globalThis: 'readonly',
      },
    },
    rules: asWarnings,
  },

  // ── Config files and plain-JS tooling ─────────────────────────────────────
  {
    files: ['*.mjs', '*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: HIGH_VALUE_RULES,
  },
];

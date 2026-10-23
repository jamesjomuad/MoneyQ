// Parser + generator checks for utils/changelog.js and
// scripts/generate-changelog-meta.mjs. Run with: npm run verify:changelog

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { latestDocumentedRelease, parseChangelogReleases } from '../utils/changelog';

let passed = 0;
let failed = 0;
function check(name, ok) {
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  FAIL ${name}`);
  }
}

// 1. Unreleased first, then several versioned releases (newest-first order).
const full = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  '### Added',
  '- something coming',
  '',
  '## [1.2.0] - 2026-10-10',
  '### Changed',
  '- a change',
  '',
  '## [1.1.0] - 2026-10-01',
  '### Fixed',
  '- a fix',
  '',
  '## [1.0.0] - 2026-09-20',
  '### Added',
  '- the start',
  '',
].join('\n');
check('parses three versioned releases', parseChangelogReleases(full).length === 3);
check('latest = first versioned heading, not Unreleased', latestDocumentedRelease(full)?.version === '1.2.0');
check('latest carries its date', latestDocumentedRelease(full)?.date === '2026-10-10');

// 2. Document order wins even when the newest heading is numerically lower.
const ordered = '## [Unreleased]\n\n## [0.9.0] - 2026-10-20\n\n## [1.2.0] - 2026-01-01\n';
check('respects newest-first ordering over numeric comparison', latestDocumentedRelease(ordered)?.version === '0.9.0');

// 3. Unreleased only → no documented release.
check('Unreleased alone yields null', latestDocumentedRelease('## [Unreleased]\n\n### Added\n- x\n') === null);

// 4. No version tags at all (legacy date headings don't count).
check('legacy date headings ignored', latestDocumentedRelease('## 2026-10-23\n\n### Added\n- x\n') === null);

// 5. Malformed headings are skipped, valid ones still found.
const messy = [
  '## [1.2] - 2026-10-10',
  '## [Unreleased',
  '## [v1.0.0] - 2026-10-10',
  '## [1.0.0] - 10-10-2026',
  '## [1.0.0] - 2026-10-10',
].join('\n');
const messyReleases = parseChangelogReleases(messy);
check('malformed headings skipped', messyReleases.length === 1);
check('only the well-formed heading parses', messyReleases[0]?.version === '1.0.0');

// 6. Degenerate input never throws.
check('empty string → []', parseChangelogReleases('').length === 0);
check('null → []', parseChangelogReleases(null).length === 0);
check('undefined → null latest', latestDocumentedRelease(undefined) === null);

// 7. SemVer extras: pre-release tags parse; build metadata too.
const pre = '## [2.0.0-beta.1] - 2026-10-15\n\n## [1.9.0] - 2026-10-01\n';
check('pre-release version recognized', latestDocumentedRelease(pre)?.version === '2.0.0-beta.1');

// 8. Undated version heading is still a release with null date.
check('undated heading parses', latestDocumentedRelease('## [3.1.4]\n')?.date === null);

// 9. The generator: writes real metadata for a fixture changelog...
const dir = mkdtempSync(join(tmpdir(), 'chg-gen-'));
const fixture = join(dir, 'CHANGELOG.md');
const out = join(dir, 'meta.js');
writeFileSync(fixture, full);
const gen = fileURLToPath(new URL('./generate-changelog-meta.mjs', import.meta.url));
const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const runGen = (args) =>
  execFileSync(process.execPath, ['--import', './scripts/register.mjs', gen, ...args], {
    encoding: 'utf8',
    cwd: repoRoot,
  });
runGen([fixture, out]);
const written = readFileSync(out, 'utf8');
check('generated module contains 1.2.0', written.includes('"latestVersion": "1.2.0"'));
check('generated module contains the date', written.includes('"releaseDate": "2026-10-10"'));

// 10. ...and graceful null metadata for a missing one.
const out2 = join(dir, 'meta2.js');
runGen([join(dir, 'does-not-exist.md'), out2]);
check('missing changelog → null version, no crash', readFileSync(out2, 'utf8').includes('"latestVersion": null'));

// 11. Regeneration follows edits (staleness guard).
writeFileSync(fixture, '## [2.0.0] - 2026-12-31\n');
runGen([fixture, out]);
check('regenerated data tracks changelog edits', readFileSync(out, 'utf8').includes('"latestVersion": "2.0.0"'));

// 12. The real CHANGELOG.md generates through the default paths.
const realOut = join(dir, 'real.js');
runGen(['CHANGELOG.md', realOut]);
check('real changelog yields a versioned release', readFileSync(realOut, 'utf8').includes('"latestVersion": "1.0.0"'));

console.log(`verify:changelog ${passed}/${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);

/**
 * Changelog parsing for the Keep a Changelog format this repo follows
 * (see AGENTS.md → Changelog and Releases).
 *
 * Release headings look like `## [1.2.0] - 2026-10-23`; `## [Unreleased]`
 * is intentionally not a release, and the legacy pre-standardization
 * sections (`## 2026-10-23`, no brackets) never match either. The file is
 * documented newest-first, so the first versioned heading found is the
 * latest documented release — order wins over numeric comparison.
 *
 * Pure string logic: no fs, no dependencies. Node reaches it through
 * scripts/register.mjs (extensionless imports); the app consumes the
 * generated constants/changelogMeta.js instead, because Metro cannot
 * import a Markdown file at runtime.
 */

// Major.minor.patch with optional pre-release and build metadata, exactly
// as SemVer 2.0.0 defines it, followed by the optional KaC ` - YYYY-MM-DD`.
const RELEASE_HEADING =
  /^##\s*\[(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)\](?:\s+-\s+(\d{4}-\d{2}-\d{2}))?\s*$/;

/**
 * All versioned release headings in document order.
 * Non-string or empty input yields an empty list; malformed headings are
 * skipped rather than throwing.
 */
export function parseChangelogReleases(markdown) {
  if (typeof markdown !== 'string' || markdown.length === 0) return [];

  const releases = [];
  for (const line of markdown.split(/\r?\n/)) {
    const match = RELEASE_HEADING.exec(line.trim());
    if (match) {
      releases.push({ version: match[1], date: match[2] ?? null });
    }
  }
  return releases;
}

/**
 * The newest documented release: the first valid versioned heading in the
 * changelog's newest-first order, or null when no versioned release exists
 * (empty file, Unreleased only, malformed headings, missing content).
 */
export function latestDocumentedRelease(markdown) {
  const [latest] = parseChangelogReleases(markdown);
  return latest ?? null;
}

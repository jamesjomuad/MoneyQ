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

// Full-content parsing for the in-app changelog screen. Everything lives
// in this one module so release data is never defined twice.
const SECTION_HEADING = /^##\s+(.+?)\s*$/;
const CATEGORY_HEADING = /^###\s+(.+?)\s*$/;
const BRACKET_HEADING = /^\[([^\]]+)\](?:\s+-\s+(\d{4}-\d{2}-\d{2}))?\s*$/;
const DATE_HEADING = /^(\d{4}-\d{2}-\d{2})$/;
const BULLET_LINE = /^[-*]\s+(.*)$/;
const VERSION_SHAPE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * The whole changelog as structured sections, in document order (the file
 * is written newest-first). Each section:
 *   { title, version, date, unreleased, categories: [{ title, items }] }
 * Handles `## [Unreleased]`, `## [1.2.0] - 2026-10-23`, the legacy
 * `## 2026-10-23` headings, and multi-line wrapped bullets. Unknown or
 * malformed headings are still kept as plain sections so the original
 * wording survives — nothing in the file is silently dropped after the
 * first heading. The preamble before `##` lines is not release content.
 */
export function parseChangelogSections(markdown) {
  if (typeof markdown !== 'string' || markdown.length === 0) return [];

  const sections = [];
  let section = null;
  let category = null;

  const openSection = (title, version, date, unreleased) => {
    section = { title, version, date, unreleased, categories: [] };
    category = null;
    sections.push(section);
  };

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    const categoryMatch = CATEGORY_HEADING.exec(line);
    if (categoryMatch && section) {
      category = { title: categoryMatch[1], items: [] };
      section.categories.push(category);
      continue;
    }

    const sectionMatch = SECTION_HEADING.exec(line);
    if (sectionMatch) {
      const heading = sectionMatch[1];
      const bracket = BRACKET_HEADING.exec(heading);
      const inner = bracket ? bracket[1] : heading;
      const date = bracket?.[2] ?? DATE_HEADING.exec(heading)?.[1] ?? null;
      openSection(
        inner,
        VERSION_SHAPE.test(inner) ? inner : null,
        date,
        /^unreleased$/i.test(inner),
      );
      continue;
    }

    if (!section) continue; // preamble above the first heading

    // Everything else is release-note prose. Bullets open a new item; any
    // other line continues the wrapped text of the current one.
    const bullet = BULLET_LINE.exec(line);
    if (!category) {
      category = { title: null, items: [] };
      section.categories.push(category);
    }
    if (bullet) {
      category.items.push(bullet[1]);
    } else if (category.items.length > 0) {
      category.items[category.items.length - 1] += ` ${line}`;
    } else {
      category.items.push(line);
    }
  }

  return sections;
}

/**
 * Budget folders — a persistent, purely organizational grouping.
 *
 *   `folders` — named groups that hold budgets (e.g. 2025, Travel, Business).
 *     `color` is the folder's own accent (nullable = theme default), `position`
 *     preserves user ordering, and the timestamps mirror every other table.
 *     Folders never own money: transactions still belong to budgets only, and
 *     no totals are computed on a folder.
 *
 *   `budgets` gains `folder_id` — an optional reference to one folder. A budget
 *     is either in at most one folder or ungrouped (NULL). Existing budgets are
 *     untouched by this migration and stay ungrouped; nothing is auto-assigned.
 *     Deleting a folder nulls these references (ON DELETE SET NULL), so a
 *     folder's budgets return to the root list instead of being deleted.
 */
export const migration = {
  version: 10,
  name: 'folders',

  async up(db) {
    await db.execAsync(`
      CREATE TABLE folders (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        color TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      ALTER TABLE budgets ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_budgets_folder ON budgets (folder_id);
    `);
  },
};

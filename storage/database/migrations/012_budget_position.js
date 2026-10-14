/**
 * Budget manual order — the persistence behind drag-and-drop reordering.
 *
 *   `budgets` gains `position`: a per-scope sort rank (scope = the budget's
 *     folder id, or NULL for the ungrouped root list). `listBudgets` orders
 *     by it before the historical date tie-break, so a user's manual order
 *     is stable across launches while budgets that were never dragged keep
 *     the old deterministic default.
 *
 *   This migration materialises that default: every existing budget is
 *     ranked within its scope by exactly the previous `ORDER BY`
 *     (start_date DESC, created_at DESC, id ASC). After the backfill the
 *     list renders identically to before — position only freezes the order
 *     that was already in effect, and future drags rewrite the ranks.
 *
 * The memory/web adapter mirrors this in JS: its comparator leads with
 * `position ?? 0`, its seeds are all-zero, and the date tie-break then
 * reproduces the same relative order as the ranks written here.
 */
export const migration = {
  version: 12,
  name: 'budget_position',

  async up(db) {
    await db.execAsync(`
      ALTER TABLE budgets ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
    `);

    // ROW_NUMBER over the OLD default order, per scope. SQLite treats NULL
    // folder_id as one partition, so ungrouped budgets rank together.
    await db.execAsync(`
      WITH ranked AS (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY folder_id
            ORDER BY start_date DESC, created_at DESC, id ASC
          ) - 1 AS rn
        FROM budgets
      )
      UPDATE budgets
         SET position = (SELECT rn FROM ranked WHERE ranked.id = budgets.id);
    `);
  },
};

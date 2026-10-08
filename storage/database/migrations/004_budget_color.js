/**
 * Adds an optional per-budget folder color:
 *
 *   `budgets.color` — a 6-digit hex string (`#FF9800`) chosen by the user in
 *   the budget form, or NULL to keep using the theme-driven folder colors
 *   (`folder`, `folderBorder`, `folderInk`). Existing rows stay NULL, so old
 *   budgets render exactly as before and theme switches never repaint a
 *   folder that has an explicit color.
 */
export const migration = {
  version: 4,
  name: 'budget_color',

  async up(db) {
    await db.execAsync('ALTER TABLE budgets ADD COLUMN color TEXT;');
  },
};

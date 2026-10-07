/**
 * SQLite implementation of the storage interface.
 *
 * This is the only place SQL is written. Repositories call these operations
 * without knowing which engine answers them, so the native app can keep
 * Expo SQLite as its persistence layer while the web build runs the
 * in-memory adapter with identical behaviour.
 *
 * `getDb` is injected rather than imported so the same adapter can be driven
 * by Expo SQLite in the app and by node:sqlite in the verification scripts.
 */

export function createSqliteAdapter(getDb) {
  const query = async (sql, ...params) => (await getDb()).getAllAsync(sql, ...params);
  const first = async (sql, ...params) => (await getDb()).getFirstAsync(sql, ...params);
  const run = async (sql, ...params) => (await getDb()).runAsync(sql, ...params);

  return {
    source: 'sqlite',

    async getSchemaVersion() {
      const row = await first('PRAGMA user_version');
      return row?.user_version ?? 0;
    },

    // --- budgets -------------------------------------------------------

    async listBudgets() {
      return query(`
        SELECT b.*,
          COALESCE(
            (SELECT SUM(t.amount) FROM transactions t
              WHERE t.budget_id = b.id AND t.type = 'expense'), 0) AS spent,
          COALESCE(
            (SELECT SUM(t.amount) FROM transactions t
              WHERE t.budget_id = b.id AND t.type = 'income'), 0) AS income,
          (SELECT COUNT(*) FROM transactions t
            WHERE t.budget_id = b.id) AS transaction_count
        FROM budgets b
        ORDER BY b.start_date DESC, b.created_at DESC
      `);
    },

    async getBudget(id) {
      return first('SELECT * FROM budgets WHERE id = ?', id);
    },

    async insertBudget(row) {
      await run(
        'INSERT INTO budgets (id, name, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        row.id,
        row.name,
        row.start_date,
        row.end_date,
        row.created_at,
        row.updated_at,
      );
    },

    async updateBudget(row) {
      await run(
        'UPDATE budgets SET name = ?, start_date = ?, end_date = ?, updated_at = ? WHERE id = ?',
        row.name,
        row.start_date,
        row.end_date,
        row.updated_at,
        row.id,
      );
    },

    /** Cascades to the budget's transactions through the foreign key. */
    async deleteBudget(id) {
      const result = await run('DELETE FROM budgets WHERE id = ?', id);
      return result.changes ?? 0;
    },

    // --- tags ----------------------------------------------------------

    async listTags({ includeArchived = false } = {}) {
      const where = includeArchived ? '' : 'WHERE archived = 0';
      return query(`SELECT * FROM tags ${where} ORDER BY name COLLATE NOCASE ASC`);
    },

    async getTag(id) {
      return first('SELECT * FROM tags WHERE id = ?', id);
    },

    /** Pass `exceptId` to ignore one row — used by the uniqueness check on edit. */
    async findTagByName(name, exceptId = null) {
      if (exceptId == null) return first('SELECT * FROM tags WHERE name = ?', name);
      return first('SELECT * FROM tags WHERE name = ? AND id <> ?', name, exceptId);
    },

    async insertTag(row) {
      await run(
        `INSERT INTO tags (id, name, emoji, color, is_default, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.name,
        row.emoji ?? null,
        row.color ?? null,
        row.is_default ?? 0,
        row.archived ?? 0,
        row.created_at,
        row.updated_at,
      );
    },

    async updateTag(row) {
      await run(
        'UPDATE tags SET name = ?, emoji = ?, color = ?, updated_at = ? WHERE id = ?',
        row.name,
        row.emoji ?? null,
        row.color ?? null,
        row.updated_at,
        row.id,
      );
    },

    async deleteTag(id) {
      const result = await run('DELETE FROM tags WHERE id = ?', id);
      return result.changes ?? 0;
    },

    async countTransactionsUsingTag(tagId) {
      const row = await first(
        'SELECT COUNT(*) AS total FROM transactions WHERE tag_id = ?',
        tagId,
      );
      return row?.total ?? 0;
    },

    // --- transactions --------------------------------------------------

    async listTransactionsByBudget(budgetId) {
      return query(
        `SELECT * FROM transactions
          WHERE budget_id = ?
          ORDER BY transaction_date DESC, created_at DESC`,
        budgetId,
      );
    },

    async getTransaction(id) {
      return first('SELECT * FROM transactions WHERE id = ?', id);
    },

    async insertTransaction(row) {
      await run(
        `INSERT INTO transactions
           (id, budget_id, type, amount, tag_id, account_id, to_account_id, description,
            transaction_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.budget_id,
        row.type,
        row.amount,
        row.tag_id ?? null,
        row.account_id ?? null,
        row.to_account_id ?? null,
        row.description ?? null,
        row.transaction_date,
        row.created_at,
        row.updated_at,
      );
    },

    async updateTransaction(row) {
      const result = await run(
        `UPDATE transactions
            SET type = ?, amount = ?, tag_id = ?, description = ?,
                transaction_date = ?, updated_at = ?
          WHERE id = ?`,
        row.type,
        row.amount,
        row.tag_id ?? null,
        row.description ?? null,
        row.transaction_date,
        row.updated_at,
        row.id,
      );
      return result.changes ?? 0;
    },

    async deleteTransaction(id) {
      const result = await run('DELETE FROM transactions WHERE id = ?', id);
      return result.changes ?? 0;
    },

    // --- reminders -----------------------------------------------------

    /**
     * Reminder rows joined with the transaction fields needed to rebuild the
     * notification body, so rescheduling never needs one query per reminder.
     */
    async listReminders() {
      return query(`
        SELECT r.*,
               t.budget_id            AS budget_id,
               t.amount               AS amount,
               t.description          AS description,
               t.transaction_date    AS transaction_date
          FROM reminders r
          JOIN transactions t ON t.id = r.transaction_id
         ORDER BY r.remind_at ASC
      `);
    },

    async getReminderByTransaction(transactionId) {
      return first('SELECT * FROM reminders WHERE transaction_id = ?', transactionId);
    },

    async insertReminder(row) {
      await run(
        `INSERT INTO reminders
           (id, transaction_id, enabled, remind_date, remind_time, remind_at,
            notification_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.transaction_id,
        row.enabled,
        row.remind_date,
        row.remind_time,
        row.remind_at,
        row.notification_id ?? null,
        row.created_at,
        row.updated_at,
      );
    },

    async updateReminder(row) {
      const result = await run(
        `UPDATE reminders
            SET enabled = ?, remind_date = ?, remind_time = ?, remind_at = ?,
                notification_id = ?, updated_at = ?
          WHERE id = ?`,
        row.enabled,
        row.remind_date,
        row.remind_time,
        row.remind_at,
        row.notification_id ?? null,
        row.updated_at,
        row.id,
      );
      return result.changes ?? 0;
    },

    // --- settings ------------------------------------------------------

    async getSetting(key, fallback = null) {
      const row = await first('SELECT value FROM settings WHERE key = ?', key);
      return row?.value ?? fallback;
    },

    async setSetting(key, value) {
      await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, String(value));
    },

    async getAllSettings() {
      const rows = await query('SELECT key, value FROM settings');
      return Object.fromEntries(rows.map((row) => [row.key, row.value]));
    },
  };
}
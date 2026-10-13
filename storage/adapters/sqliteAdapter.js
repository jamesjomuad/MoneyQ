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
  // One FIFO chain for every operation. `expo-sqlite`'s async native calls run
  // on a coroutine *pool* and only lock per prepared statement, never per
  // connection, so overlapping queries against the shared `NativeDatabase`
  // handle can race sqlite3_prepare/step/finalize — surfacing as
  // "prepareAsync ... Cannot use shared object that was already released".
  // Serializing here (in the adapter, the layer that owns the engine) keeps
  // each operation's prepare → execute → finalize whole before the next
  // starts. A failed operation rejects its own caller but never wedges the
  // chain, so the next query still runs.
  let tail = Promise.resolve();
  const serialize = (operation) => {
    const result = tail.then(operation, operation);
    tail = result.then(
      () => {},
      () => {},
    );
    return result;
  };

  const query = (sql, ...params) =>
    serialize(async () => (await getDb()).getAllAsync(sql, ...params));
  const first = (sql, ...params) =>
    serialize(async () => (await getDb()).getFirstAsync(sql, ...params));
  const run = (sql, ...params) =>
    serialize(async () => (await getDb()).runAsync(sql, ...params));
  const exec = (sql) => serialize(async () => (await getDb()).execAsync(sql));

  return {
    source: 'sqlite',

    async getSchemaVersion() {
      const row = await first('PRAGMA user_version');
      return row?.user_version ?? 0;
    },

    // Explicit transaction control so a repository can commit a parent row
    // and its breakdown items as one logical write. Because every operation
    // here runs through the same FIFO chain on one connection, anything
    // queued between BEGIN and COMMIT participates in the SQL transaction —
    // a failing child rejects its caller and the repository's ROLLBACK
    // discards the whole group.
    beginTransaction() {
      return exec('BEGIN IMMEDIATE');
    },

    commitTransaction() {
      return exec('COMMIT');
    },

    rollbackTransaction() {
      return exec('ROLLBACK');
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
        'INSERT INTO budgets (id, name, start_date, end_date, color, folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        row.id,
        row.name,
        row.start_date,
        row.end_date,
        row.color ?? null,
        row.folder_id ?? null,
        row.created_at,
        row.updated_at,
      );
    },

    async updateBudget(row) {
      await run(
        'UPDATE budgets SET name = ?, start_date = ?, end_date = ?, color = ?, folder_id = ?, updated_at = ? WHERE id = ?',
        row.name,
        row.start_date,
        row.end_date,
        row.color ?? null,
        row.folder_id ?? null,
        row.updated_at,
        row.id,
      );
    },

    /** Cascades to the budget's transactions through the foreign key. */
    async deleteBudget(id) {
      const result = await run('DELETE FROM budgets WHERE id = ?', id);
      return result.changes ?? 0;
    },

    // --- folders ---------------------------------------------------------

    /** Budget folders in user order; ties fall back to creation time, then id. */
    async listFolders() {
      return query(`
        SELECT * FROM folders
         ORDER BY position ASC, created_at ASC, id ASC
      `);
    },

    async getFolder(id) {
      return first('SELECT * FROM folders WHERE id = ?', id);
    },

    /** Pass `exceptId` to ignore one row — used by the uniqueness check on edit. */
    async findFolderByName(name, exceptId = null) {
      if (exceptId == null) return first('SELECT * FROM folders WHERE name = ?', name);
      return first('SELECT * FROM folders WHERE name = ? AND id <> ?', name, exceptId);
    },

    async insertFolder(row) {
      await run(
        `INSERT INTO folders (id, name, color, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        row.id,
        row.name,
        row.color ?? null,
        row.position ?? 0,
        row.created_at,
        row.updated_at,
      );
    },

    async updateFolder(row) {
      await run(
        'UPDATE folders SET name = ?, color = ?, position = ?, updated_at = ? WHERE id = ?',
        row.name,
        row.color ?? null,
        row.position ?? 0,
        row.updated_at,
        row.id,
      );
    },

    /** The FK nulls `budgets.folder_id`, so the folder's budgets return to root. */
    async deleteFolder(id) {
      const result = await run('DELETE FROM folders WHERE id = ?', id);
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

    async listTransactionsInRange(startIso, endIso) {
      return query(
        `SELECT * FROM transactions
          WHERE transaction_date >= ? AND transaction_date <= ?
          ORDER BY transaction_date DESC, created_at DESC`,
        startIso,
        endIso,
      );
    },

    /**
     * Cross-budget text search used by Home. Case-insensitive substring match
     * on the description, the joined tag name, or any breakdown item's
     * description — a child match returns the parent row, never the child,
     * with `sub_transaction_count` so results can label their items. LIKE
     * wildcards in the term are escaped so a query of '100%' searches for the
     * literal text. Rows carry the owning folder's name so results can be
     * grouped by it.
     */
    async searchTransactions(term, limit) {
      const pattern = `%${String(term)
        .toLowerCase()
        .replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
      return query(
        `SELECT t.*, tg.name AS tag_name, tg.emoji AS tag_emoji, tg.color AS tag_color,
                b.name AS budget_name,
                (SELECT COUNT(*) FROM sub_transactions s
                  WHERE s.transaction_id = t.id) AS sub_transaction_count
          FROM transactions t
          LEFT JOIN tags tg ON tg.id = t.tag_id
          JOIN budgets b ON b.id = t.budget_id
          WHERE lower(t.description) LIKE ? ESCAPE '\\'
             OR lower(tg.name) LIKE ? ESCAPE '\\'
             OR EXISTS (SELECT 1 FROM sub_transactions s
                         WHERE s.transaction_id = t.id
                           AND lower(s.description) LIKE ? ESCAPE '\\')
          ORDER BY t.transaction_date DESC, t.created_at DESC
          LIMIT ?`,
        pattern,
        pattern,
        pattern,
        limit,
      );
    },

    async getTransaction(id) {
      return first('SELECT * FROM transactions WHERE id = ?', id);
    },

    async insertTransaction(row) {
      await run(
        `INSERT INTO transactions
           (id, budget_id, type, amount, tag_id, account_id, to_account_id, description,
            transaction_date, payment_status, has_breakdown, payment_due_date,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.budget_id,
        row.type,
        row.amount,
        row.tag_id ?? null,
        row.account_id ?? null,
        row.to_account_id ?? null,
        row.description ?? null,
        row.transaction_date,
        row.payment_status ?? null,
        row.has_breakdown ? 1 : 0,
        row.payment_due_date ?? null,
        row.created_at,
        row.updated_at,
      );
    },

    async updateTransaction(row) {
      const result = await run(
        `UPDATE transactions
            SET type = ?, amount = ?, tag_id = ?, description = ?,
                transaction_date = ?, payment_status = ?, has_breakdown = ?,
                payment_due_date = ?, updated_at = ?
          WHERE id = ?`,
        row.type,
        row.amount,
        row.tag_id ?? null,
        row.description ?? null,
        row.transaction_date,
        row.payment_status ?? null,
        row.has_breakdown ? 1 : 0,
        row.payment_due_date ?? null,
        row.updated_at,
        row.id,
      );
      return result.changes ?? 0;
    },

    async deleteTransaction(id) {
      const result = await run('DELETE FROM transactions WHERE id = ?', id);
      return result.changes ?? 0;
    },

    // --- sub-transactions (breakdown items) ------------------------------

    /** Every breakdown item of one budget in one read — never one per row. */
    async listSubTransactionsByBudget(budgetId) {
      return query(
        `SELECT s.* FROM sub_transactions s
          JOIN transactions t ON t.id = s.transaction_id
          WHERE t.budget_id = ?
          ORDER BY s.transaction_id, s.position ASC, s.id ASC`,
        budgetId,
      );
    },

    async listSubTransactionsByParent(transactionId) {
      return query(
        `SELECT * FROM sub_transactions
          WHERE transaction_id = ?
          ORDER BY position ASC, id ASC`,
        transactionId,
      );
    },

    /**
     * Breakdown items for many parents in one read — Reports hydrates every
     * breakdown row without one serialized query per parent. Ordering within
     * each parent matches listSubTransactionsByParent (position, id).
     */
    async listSubTransactionsForParents(ids) {
      const unique = [...new Set(ids)];
      const rows = [];
      // Chunked to stay far below SQLite's bound-parameter limit.
      for (let i = 0; i < unique.length; i += 400) {
        const chunk = unique.slice(i, i + 400);
        rows.push(
          ...(await query(
            `SELECT * FROM sub_transactions
              WHERE transaction_id IN (${chunk.map(() => '?').join(', ')})
              ORDER BY transaction_id, position ASC, id ASC`,
            ...chunk,
          )),
        );
      }
      return rows;
    },

    async insertSubTransaction(row) {
      await run(
        `INSERT INTO sub_transactions
           (id, transaction_id, description, amount, position,
            purchase_date, purchase_time, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.transaction_id,
        row.description,
        row.amount,
        row.position,
        row.purchase_date ?? null,
        row.purchase_time ?? null,
        row.notes ?? null,
        row.created_at,
        row.updated_at,
      );
    },

    /** Bulk removal before a rewrite; also the manual mirror of the FK cascade. */
    async deleteSubTransactionsForParent(transactionId) {
      const result = await run('DELETE FROM sub_transactions WHERE transaction_id = ?', transactionId);
      return result.changes ?? 0;
    },

    /**
     * Purchase events for one date range (Calendar): items dated inside the
     * range, joined with the minimum parent context needed to render and to
     * navigate (id, type, tag, description, budget). Only items that actually
     * carry a purchase date become events. Never a financial row.
     */
    async listSubTransactionsInRange(startIso, endIso) {
      return query(
        `SELECT s.*, t.type AS parent_type, t.tag_id AS parent_tag_id,
                t.description AS parent_description, t.budget_id AS parent_budget_id,
                t.transaction_date AS parent_transaction_date,
                t.payment_due_date AS parent_payment_due_date
          FROM sub_transactions s
          JOIN transactions t ON t.id = s.transaction_id
          WHERE s.purchase_date >= ? AND s.purchase_date <= ?
          ORDER BY s.purchase_date ASC, s.purchase_time ASC, s.position ASC, s.id ASC`,
        startIso,
        endIso,
      );
    },

    /** Parents scheduled to be due inside a date range (Calendar payment events). */
    async listTransactionsByDueDateRange(startIso, endIso) {
      return query(
        `SELECT * FROM transactions
          WHERE payment_due_date >= ? AND payment_due_date <= ?
          ORDER BY payment_due_date ASC, created_at DESC`,
        startIso,
        endIso,
      );
    },

    // --- reminders -----------------------------------------------------

    /**
     * Reminder rows LEFT JOINed with their transaction, so a standalone
     * reminder (transaction_id NULL) still appears with NULL transaction
     * fields. The joined columns exist so rescheduling and the Calendar tab
     * never need one query per reminder. Ordered by the instant they fire.
     */
    async listReminders() {
      return query(`
        SELECT r.*,
               t.budget_id            AS budget_id,
               t.amount               AS amount,
               t.description          AS description,
               t.transaction_date    AS transaction_date
          FROM reminders r
          LEFT JOIN transactions t ON t.id = r.transaction_id
         ORDER BY r.remind_at ASC
      `);
    },

    async getReminder(id) {
      return first(`
        SELECT r.*,
               t.budget_id            AS budget_id,
               t.amount               AS amount,
               t.description          AS description,
               t.transaction_date     AS transaction_date
          FROM reminders r
          LEFT JOIN transactions t ON t.id = r.transaction_id
         WHERE r.id = ?
      `, id);
    },

    /** The oldest reminder linked to a transaction, if any. */
    async getReminderByTransaction(transactionId) {
      if (transactionId == null) return null;
      return first(
        `
        SELECT r.*,
               t.budget_id            AS budget_id,
               t.amount               AS amount,
               t.description          AS description,
               t.transaction_date     AS transaction_date
          FROM reminders r
          LEFT JOIN transactions t ON t.id = r.transaction_id
         WHERE r.transaction_id = ?
         ORDER BY r.created_at ASC, r.id ASC
         LIMIT 1
        `,
        transactionId,
      );
    },

    async insertReminder(row) {
      await run(
        `INSERT INTO reminders
           (id, transaction_id, enabled, status, remind_date, remind_time, remind_at,
            notification_id, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.transaction_id ?? null,
        row.enabled,
        row.status ?? 'active',
        row.remind_date,
        row.remind_time,
        row.remind_at,
        row.notification_id ?? null,
        row.notes ?? '',
        row.created_at,
        row.updated_at,
      );
    },

    async updateReminder(row) {
      // notes and status are COALESCEd so notification bookkeeping — which
      // updates only the OS id — can never blank a note or a lifecycle state;
      // pass '' / an explicit value to change them.
      const result = await run(
        `UPDATE reminders
            SET enabled = ?, status = COALESCE(?, status), remind_date = ?, remind_time = ?, remind_at = ?,
                notification_id = ?, notes = COALESCE(?, notes), updated_at = ?
          WHERE id = ?`,
        row.enabled,
        row.status ?? null,
        row.remind_date,
        row.remind_time,
        row.remind_at,
        row.notification_id ?? null,
        row.notes ?? null,
        row.updated_at,
        row.id,
      );
      return result.changes ?? 0;
    },

    async deleteReminder(id) {
      const result = await run('DELETE FROM reminders WHERE id = ?', id);
      return result.changes ?? 0;
    },

    /**
     * Removes every reminder linked to a budget's transactions. Used before a
     * budget delete: the FK would only SET NULL on the reminders, but a
     * deleted budget's reminders belong with it.
     */
    async deleteRemindersForBudget(budgetId) {
      const result = await run(
        `DELETE FROM reminders
          WHERE transaction_id IN (SELECT id FROM transactions WHERE budget_id = ?)`,
        budgetId,
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

    // --- accounts ------------------------------------------------------

    async listAccounts() {
      return query('SELECT * FROM accounts ORDER BY created_at ASC, id ASC');
    },

    async insertAccount(row) {
      await run(
        `INSERT INTO accounts (id, name, type, initial_balance, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.name,
        row.type ?? 'cash',
        row.initial_balance ?? 0,
        row.archived ?? 0,
        row.created_at,
        row.updated_at,
      );
    },

    // --- full-row replacements (backup merge) --------------------------

    async replaceAccount(row) {
      const result = await run(
        `UPDATE accounts
            SET name = ?, type = ?, initial_balance = ?, archived = ?,
                created_at = ?, updated_at = ?
          WHERE id = ?`,
        row.name,
        row.type ?? 'cash',
        row.initial_balance ?? 0,
        row.archived ?? 0,
        row.created_at,
        row.updated_at,
        row.id,
      );
      return result.changes ?? 0;
    },

    async replaceBudget(row) {
      const result = await run(
        `UPDATE budgets
            SET name = ?, start_date = ?, end_date = ?, color = ?, folder_id = ?,
                created_at = ?, updated_at = ?
          WHERE id = ?`,
        row.name,
        row.start_date,
        row.end_date,
        row.color ?? null,
        row.folder_id ?? null,
        row.created_at,
        row.updated_at,
        row.id,
      );
      return result.changes ?? 0;
    },

    async replaceFolder(row) {
      const result = await run(
        `UPDATE folders
            SET name = ?, color = ?, position = ?, created_at = ?, updated_at = ?
          WHERE id = ?`,
        row.name,
        row.color ?? null,
        row.position ?? 0,
        row.created_at,
        row.updated_at,
        row.id,
      );
      return result.changes ?? 0;
    },

    async replaceTag(row) {
      const result = await run(
        `UPDATE tags
            SET name = ?, emoji = ?, color = ?, is_default = ?, archived = ?,
                created_at = ?, updated_at = ?
          WHERE id = ?`,
        row.name,
        row.emoji ?? null,
        row.color ?? null,
        row.is_default ?? 0,
        row.archived ?? 0,
        row.created_at,
        row.updated_at,
        row.id,
      );
      return result.changes ?? 0;
    },

    async replaceTransaction(row) {
      const result = await run(
        `UPDATE transactions
            SET budget_id = ?, type = ?, amount = ?, tag_id = ?, account_id = ?,
                to_account_id = ?, description = ?, transaction_date = ?,
                payment_status = ?, has_breakdown = ?, payment_due_date = ?,
                created_at = ?, updated_at = ?
          WHERE id = ?`,
        row.budget_id,
        row.type,
        row.amount,
        row.tag_id ?? null,
        row.account_id ?? null,
        row.to_account_id ?? null,
        row.description ?? null,
        row.transaction_date,
        row.payment_status ?? null,
        row.has_breakdown ? 1 : 0,
        row.payment_due_date ?? null,
        row.created_at,
        row.updated_at,
        row.id,
      );
      return result.changes ?? 0;
    },

    async replaceReminder(row) {
      const result = await run(
        `UPDATE reminders
            SET transaction_id = ?, enabled = ?, status = ?, remind_date = ?,
                remind_time = ?, remind_at = ?, notification_id = ?, notes = ?,
                created_at = ?, updated_at = ?
          WHERE id = ?`,
        row.transaction_id ?? null,
        row.enabled ?? 1,
        row.status ?? 'active',
        row.remind_date,
        row.remind_time,
        row.remind_at,
        row.notification_id ?? null,
        row.notes ?? '',
        row.created_at,
        row.updated_at,
        row.id,
      );
      return result.changes ?? 0;
    },

    // --- backup restore -------------------------------------------------

    /** Empty every data table (children first); settings included. */
    async clearAllData() {
      await exec(
        `DELETE FROM sub_transactions;
         DELETE FROM transactions;
         DELETE FROM reminders;
         DELETE FROM budgets;
         DELETE FROM folders;
         DELETE FROM tags;
         DELETE FROM accounts;
         DELETE FROM settings;`,
      );
    },
  };
}
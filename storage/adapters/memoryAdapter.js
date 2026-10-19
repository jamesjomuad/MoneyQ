/**
 * In-memory implementation of the storage interface.
 *
 * Used by the web build so Expo Go stays the real target while the browser
 * becomes a useful UI/UX harness: no worker, no wasm, no persistence. Every
 * method mirrors the SQLite adapter's behaviour for the operations the app
 * actually performs, so repositories and stores stay completely unaware of
 * which engine they are talking to.
 */

import { DEFAULT_TAGS } from '../../constants/finance';
import { createId, nowIso } from '../../utils/id';
import { suggestBudgetDates, toIsoDate, addDaysIso } from '../../utils/dates';
import { buildRemindAt } from '../../utils/reminders';
import { LATEST_VERSION } from '../database/migrations';

export function createMemoryAdapter({ seedDemo = false } = {}) {
  const store = {
    accounts: [],
    budgets: [],
    folders: [],
    tags: [],
    transactions: [],
    subTransactions: [],
    attachments: [],
    reminders: [],
    settings: new Map(),
  };

  const timestamp = nowIso();
  seedDefaultTags(store, timestamp);
  if (seedDemo) seedDemoData(store, timestamp);

  // Holds the pre-transaction snapshot while a repository group is open;
  // see beginTransaction/rollbackTransaction below.
  let journal = null;

  const copy = (row) => (row ? { ...row } : null);

  /**
   * SQLite's reminder LEFT JOIN: reminder row plus its transaction's
   * budget_id, amount, description and transaction_date (all NULL for a
   * standalone reminder). Every reminder read recomputes these from the
   * current transaction row, so no stale join data is ever returned.
   */
  const projectReminder = (reminder) => {
    if (!reminder) return null;
    const transaction = reminder.transaction_id
      ? store.transactions.find((tx) => tx.id === reminder.transaction_id)
      : null;
    return copy({
      ...reminder,
      budget_id: transaction?.budget_id ?? null,
      amount: transaction?.amount ?? null,
      description: transaction?.description ?? null,
      transaction_date: transaction?.transaction_date ?? null,
    });
  };

  /**
   * SQLite's `ORDER BY position, start_date DESC, created_at DESC`. Untouched
   * scopes share position 0, so the date tie-break reproduces the historical
   * default order exactly (mirrors migration 012's materialised ranks).
   */
  const byBudgetPeriod = (a, b) =>
    (a.position ?? 0) - (b.position ?? 0) ||
    b.start_date.localeCompare(a.start_date) ||
    b.created_at.localeCompare(a.created_at);

  /**
   * Ids of soft-deleted (archived) budgets. Cross-budget reads hide their
   * rows, mirroring the adapters' `deleted_at IS NULL` join.
   */
  const archivedBudgetIds = () =>
    new Set(
      store.budgets.filter((budget) => budget.deleted_at != null).map((budget) => budget.id),
    );

  /** SQLite's folder order: `ORDER BY position, created_at, id`. */
  const byFolderPosition = (a, b) =>
    a.position - b.position ||
    a.created_at.localeCompare(b.created_at) ||
    a.id.localeCompare(b.id);

  /** SQLite's `ORDER BY transaction_date DESC, created_at DESC`. */
  const byTransactionDate = (a, b) =>
    b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at);

  /** SQLite's `ORDER BY name COLLATE NOCASE ASC`. */
  const byTagName = (a, b) => {
    const left = a.name.toLowerCase();
    const right = b.name.toLowerCase();
    return left < right ? -1 : left > right ? 1 : 0;
  };

  /** SQLite's breakdown ordering: `ORDER BY transaction_id, position, id`. */
  const bySubTransaction = (a, b) =>
    a.transaction_id.localeCompare(b.transaction_id) ||
    a.position - b.position ||
    a.id.localeCompare(b.id);

  /** SQLite's per-parent ordering: `ORDER BY position ASC, id ASC`. */
  const bySubTransactionPosition = (a, b) => a.position - b.position || a.id.localeCompare(b.id);

  /** SQLite's gallery ordering: `ORDER BY created_at ASC, id ASC`. */
  const byAttachment = (a, b) =>
    String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id);

  return {
    source: 'memory',

    async getSchemaVersion() {
      return LATEST_VERSION;
    },

    // Transaction control mirrors the SQLite adapter's atomic writes: begin
    // takes a snapshot journal of every table, commit drops it, and rollback
    // restores it — so a failed repository group (and a failed backup
    // restore, which touches every table) can never leave half-updated data
    // in memory either.
    beginTransaction() {
      journal = {
        accounts: store.accounts.map((row) => ({ ...row })),
        budgets: store.budgets.map((row) => ({ ...row })),
        folders: store.folders.map((row) => ({ ...row })),
        tags: store.tags.map((row) => ({ ...row })),
        transactions: store.transactions.map((row) => ({ ...row })),
        subTransactions: store.subTransactions.map((row) => ({ ...row })),
        attachments: store.attachments.map((row) => ({ ...row })),
        reminders: store.reminders.map((row) => ({ ...row })),
        settings: new Map(store.settings),
      };
      return Promise.resolve();
    },

    commitTransaction() {
      journal = null;
      return Promise.resolve();
    },

    rollbackTransaction() {
      if (!journal) return Promise.resolve();
      store.accounts = journal.accounts;
      store.budgets = journal.budgets;
      store.folders = journal.folders;
      store.tags = journal.tags;
      store.transactions = journal.transactions;
      store.subTransactions = journal.subTransactions;
      store.attachments = journal.attachments;
      store.reminders = journal.reminders;
      store.settings = journal.settings;
      journal = null;
      return Promise.resolve();
    },

    // --- budgets -------------------------------------------------------

    /**
     * Mirrors SQLite's `listBudgets`: archived (soft-deleted) budgets are
     * hidden unless `includeArchived` is passed.
     */
    async listBudgets({ includeArchived = false } = {}) {
      return [...store.budgets]
        .filter((budget) => includeArchived || budget.deleted_at == null)
        .sort(byBudgetPeriod)
        .map((budget) => {
          let spent = 0;
          let income = 0;
          let transactionCount = 0;
          for (const transaction of store.transactions) {
            if (transaction.budget_id !== budget.id) continue;
            transactionCount += 1;
            if (transaction.type === 'expense') spent += transaction.amount;
            else if (transaction.type === 'income') income += transaction.amount;
          }
          return { ...budget, spent, income, transaction_count: transactionCount };
        });
    },

    async getBudget(id) {
      return copy(store.budgets.find((budget) => budget.id === id) ?? null);
    },

    async insertBudget(row) {
      // Mirror the SQLite schema: `color` and `folder_id` always exist on the
      // row (NULL when the budget keeps theme colors / stays ungrouped),
      // `position` defaults to the scope's rank 0 like the column default, and
      // `deleted_at` is NULL (active) for every fresh budget.
      store.budgets.push({ color: null, folder_id: null, position: 0, deleted_at: null, ...row });
    },

    async updateBudget(row) {
      const index = store.budgets.findIndex((budget) => budget.id === row.id);
      if (index >= 0) store.budgets[index] = { ...store.budgets[index], ...row };
    },

    /**
     * Bulk rank rewrite backing manual budget order. Mirrors the SQLite
     * adapter's transactional version: the journal snapshot means a caller
     * that wraps this in begin/commit gets all-or-nothing on both engines.
     */
    async updateBudgetPositions(entries, timestamp) {
      for (const entry of entries) {
        const index = store.budgets.findIndex((budget) => budget.id === entry.id);
        if (index >= 0) {
          store.budgets[index] = { ...store.budgets[index], position: entry.position, updated_at: timestamp };
        }
      }
    },

    /**
     * Cascades to the budget's transactions through the foreign key; their
     * reminders are only unlinked (`ON DELETE SET NULL`), not deleted — the
     * app layer calls deleteRemindersForBudget when a budget is removed.
     */
    async deleteBudget(id) {
      const before = store.budgets.length;
      store.budgets = store.budgets.filter((budget) => budget.id !== id);
      const removed = before - store.budgets.length;
      const doomed = new Set(
        store.transactions.filter((transaction) => transaction.budget_id === id).map((t) => t.id),
      );
      store.transactions = store.transactions.filter(
        (transaction) => transaction.budget_id !== id,
      );
      store.subTransactions = store.subTransactions.filter(
        (item) => !doomed.has(item.transaction_id),
      );
      store.attachments = store.attachments.filter(
        (attachment) => !doomed.has(attachment.transaction_id),
      );
      for (const reminder of store.reminders) {
        if (doomed.has(reminder.transaction_id)) reminder.transaction_id = null;
      }
      return removed;
    },

    /**
     * Soft-delete flip for archive/restore. `null` restores the budget; a
     * timestamp archives it. Nothing else on the budget — or any associated
     * record — is touched.
     */
    async setBudgetArchived(id, deletedAt, timestamp) {
      const index = store.budgets.findIndex((budget) => budget.id === id);
      if (index < 0) return 0;
      store.budgets[index] = {
        ...store.budgets[index],
        deleted_at: deletedAt ?? null,
        updated_at: timestamp,
      };
      return 1;
    },

    /** Archive every active budget still in one folder (folder delete). */
    async archiveBudgetsInFolder(folderId, deletedAt, timestamp) {
      let changes = 0;
      store.budgets = store.budgets.map((budget) => {
        if (budget.folder_id !== folderId || budget.deleted_at != null) return budget;
        changes += 1;
        return { ...budget, deleted_at: deletedAt ?? null, updated_at: timestamp };
      });
      return changes;
    },

    // --- folders ---------------------------------------------------------

    /** SQLite's `ORDER BY position ASC, created_at ASC, id ASC`. */
    async listFolders() {
      return [...store.folders].sort(byFolderPosition).map(copy);
    },

    async getFolder(id) {
      return copy(store.folders.find((folder) => folder.id === id) ?? null);
    },

    /** Pass `exceptId` to ignore one row — used by the uniqueness check on edit. */
    async findFolderByName(name, exceptId = null) {
      return copy(store.folders.find((folder) => folder.name === name && folder.id !== exceptId) ?? null);
    },

    async insertFolder(row) {
      store.folders.push({
        id: row.id,
        name: row.name,
        color: row.color ?? null,
        position: row.position ?? 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    },

    async updateFolder(row) {
      const index = store.folders.findIndex((folder) => folder.id === row.id);
      if (index >= 0) store.folders[index] = { ...store.folders[index], ...row };
    },

    /**
     * Mirrors `ON DELETE SET NULL` on `budgets.folder_id`: the group goes, its
     * budgets survive and return to the root list untouched.
     */
    async deleteFolder(id) {
      const before = store.folders.length;
      store.folders = store.folders.filter((folder) => folder.id !== id);
      const removed = before - store.folders.length;
      for (const budget of store.budgets) {
        if (budget.folder_id === id) budget.folder_id = null;
      }
      return removed;
    },

    // --- tags ----------------------------------------------------------

    async listTags({ includeArchived = false } = {}) {
      return store.tags
        .filter((tag) => includeArchived || tag.archived === 0)
        .sort(byTagName)
        .map(copy);
    },

    async getTag(id) {
      return copy(store.tags.find((tag) => tag.id === id) ?? null);
    },

    /** Pass `exceptId` to ignore one row — used by the uniqueness check on edit. */
    async findTagByName(name, exceptId = null) {
      return copy(store.tags.find((tag) => tag.name === name && tag.id !== exceptId) ?? null);
    },

    async insertTag(row) {
      store.tags.push({ ...row });
    },

    async updateTag(row) {
      const index = store.tags.findIndex((tag) => tag.id === row.id);
      if (index >= 0) store.tags[index] = { ...store.tags[index], ...row };
    },

    /** Mirrors `ON DELETE SET NULL`: transactions keep their amount. */
    async deleteTag(id) {
      const before = store.tags.length;
      store.tags = store.tags.filter((tag) => tag.id !== id);
      const removed = before - store.tags.length;
      for (const transaction of store.transactions) {
        if (transaction.tag_id === id) transaction.tag_id = null;
      }
      return removed;
    },

    async countTransactionsUsingTag(tagId) {
      return store.transactions.filter((transaction) => transaction.tag_id === tagId).length;
    },

    // --- transactions --------------------------------------------------

    async listTransactionsByBudget(budgetId) {
      return store.transactions
        .filter((transaction) => transaction.budget_id === budgetId)
        .sort(byTransactionDate)
        .map(copy);
    },

    async listTransactionsInRange(startIso, endIso) {
      const archived = archivedBudgetIds();
      return store.transactions
        .filter(
          (transaction) =>
            !archived.has(transaction.budget_id) &&
            transaction.transaction_date >= startIso &&
            transaction.transaction_date <= endIso,
        )
        .sort(byTransactionDate)
        .map(copy);
    },

    /**
     * SQLite's case-insensitive description-or-tag-name search, now also
     * matching breakdown item descriptions — a child match returns the parent
     * row with `sub_transaction_count`, never the child. Wildcards literal.
     */
    async searchTransactions(term, limit) {
      const needle = String(term).toLowerCase();
      const archived = archivedBudgetIds();
      const tagById = new Map(store.tags.map((tag) => [tag.id, tag]));
      const budgetById = new Map(store.budgets.map((budget) => [budget.id, budget]));
      return store.transactions
        .filter((transaction) => {
          if (archived.has(transaction.budget_id)) return false;
          const inDescription = (transaction.description ?? '')
            .toLowerCase()
            .includes(needle);
          const tag = tagById.get(transaction.tag_id);
          const inTag = tag ? tag.name.toLowerCase().includes(needle) : false;
          const inItems = store.subTransactions.some(
            (item) =>
              item.transaction_id === transaction.id &&
              item.description.toLowerCase().includes(needle),
          );
          return inDescription || inTag || inItems;
        })
        .sort(byTransactionDate)
        .slice(0, limit)
        .map((transaction) => {
          const tag = tagById.get(transaction.tag_id) ?? null;
          return copy({
            ...transaction,
            tag_name: tag?.name ?? null,
            tag_emoji: tag?.emoji ?? null,
            tag_color: tag?.color ?? null,
            budget_name: budgetById.get(transaction.budget_id)?.name ?? null,
            sub_transaction_count: store.subTransactions.filter(
              (item) => item.transaction_id === transaction.id,
            ).length,
          });
        });
    },

    async getTransaction(id) {
      return copy(store.transactions.find((transaction) => transaction.id === id) ?? null);
    },

    // Keys are laid out in the exact column order of the migrated table
    // (added-by-ALTER columns last) so a row read back here serializes
    // identically to `SELECT *` in SQLite — the parity check depends on it.
    async insertTransaction(row) {
      store.transactions.push({
        id: row.id,
        budget_id: row.budget_id,
        type: row.type,
        amount: row.amount,
        tag_id: row.tag_id ?? null,
        account_id: row.account_id ?? null,
        to_account_id: row.to_account_id ?? null,
        description: row.description ?? null,
        transaction_date: row.transaction_date,
        payment_status: row.payment_status ?? null,
        has_breakdown: row.has_breakdown ? 1 : 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
        payment_due_date: row.payment_due_date ?? null,
      });
    },

    async updateTransaction(row) {
      const existing = store.transactions.find((transaction) => transaction.id === row.id);
      if (!existing) return 0;
      existing.type = row.type;
      existing.amount = row.amount;
      existing.tag_id = row.tag_id ?? null;
      existing.description = row.description ?? null;
      existing.transaction_date = row.transaction_date;
      existing.payment_status = row.payment_status ?? null;
      existing.has_breakdown = row.has_breakdown ? 1 : 0;
      existing.payment_due_date = row.payment_due_date ?? null;
      existing.updated_at = row.updated_at;
      return 1;
    },

    /**
     * Mirrors `ON DELETE SET NULL` on reminders: the transaction goes, the
     * reminder survives as a standalone record. Mirrors `ON DELETE CASCADE`
     * on sub_transactions and attachments: the breakdown and the receipt
     * images belong to their parent and go with it, never orphaned.
     */
    async deleteTransaction(id) {
      const before = store.transactions.length;
      store.transactions = store.transactions.filter((transaction) => transaction.id !== id);
      store.subTransactions = store.subTransactions.filter(
        (item) => item.transaction_id !== id,
      );
      store.attachments = store.attachments.filter(
        (attachment) => attachment.transaction_id !== id,
      );
      for (const reminder of store.reminders) {
        if (reminder.transaction_id === id) reminder.transaction_id = null;
      }
      return before - store.transactions.length;
    },

    // --- attachments (receipt images) ------------------------------------

    /** Mirror of the SQLite read: oldest first, (created_at, id) order. */
    async listAttachmentsByTransaction(transactionId) {
      return store.attachments
        .filter((attachment) => attachment.transaction_id === transactionId)
        .sort(byAttachment)
        .map(copy);
    },

    /** Mirror of the SQLite batch read; grouped rows keep (created_at, id) order. */
    async listAttachmentsForParents(ids) {
      const wanted = new Set(ids);
      return store.attachments
        .filter((attachment) => wanted.has(attachment.transaction_id))
        .sort((a, b) => a.transaction_id.localeCompare(b.transaction_id) || byAttachment(a, b))
        .map(copy);
    },

    async getAttachment(id) {
      return copy(store.attachments.find((attachment) => attachment.id === id) ?? null);
    },

    async insertAttachment(row) {
      store.attachments.push({
        id: row.id,
        transaction_id: row.transaction_id,
        path: row.path,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    },

    async deleteAttachment(id) {
      const index = store.attachments.findIndex((attachment) => attachment.id === id);
      if (index === -1) return 0;
      store.attachments.splice(index, 1);
      return 1;
    },

    /** Bulk removal before a rewrite; mirrors the FK cascade for a parent. */
    async deleteAttachmentsForTransaction(transactionId) {
      const before = store.attachments.length;
      store.attachments = store.attachments.filter(
        (attachment) => attachment.transaction_id !== transactionId,
      );
      return before - store.attachments.length;
    },

    // --- sub-transactions (breakdown items) ------------------------------

    async listSubTransactionsByBudget(budgetId) {
      const inBudget = new Set(
        store.transactions
          .filter((transaction) => transaction.budget_id === budgetId)
          .map((t) => t.id),
      );
      return store.subTransactions
        .filter((item) => inBudget.has(item.transaction_id))
        .sort(bySubTransaction)
        .map(copy);
    },

    async listSubTransactionsByParent(transactionId) {
      return store.subTransactions
        .filter((item) => item.transaction_id === transactionId)
        .sort(bySubTransactionPosition)
        .map(copy);
    },

    /** Mirror of the SQLite batch read; grouped rows keep (position, id) order. */
    async listSubTransactionsForParents(ids) {
      const wanted = new Set(ids);
      return store.subTransactions
        .filter((item) => wanted.has(item.transaction_id))
        .sort(bySubTransaction)
        .map(copy);
    },

    async insertSubTransaction(row) {
      store.subTransactions.push({
        id: row.id,
        transaction_id: row.transaction_id,
        description: row.description,
        amount: row.amount,
        position: row.position,
        created_at: row.created_at,
        updated_at: row.updated_at,
        purchase_date: row.purchase_date ?? null,
        purchase_time: row.purchase_time ?? null,
        notes: row.notes ?? null,
      });
    },

    /**
     * Purchase events for one date range (Calendar): dated items joined with
     * the parent context the SQLite adapter's query returns, with the same
     * ordering — date, then time, then persisted position, then id.
     */
    async listSubTransactionsInRange(startIso, endIso) {
      const parentById = new Map(store.transactions.map((t) => [t.id, t]));
      const archived = archivedBudgetIds();
      return store.subTransactions
        .filter((item) =>
          item.purchase_date != null &&
          item.purchase_date >= startIso &&
          item.purchase_date <= endIso &&
          !archived.has(parentById.get(item.transaction_id)?.budget_id),
        )
        .sort(
          (a, b) =>
            String(a.purchase_date).localeCompare(String(b.purchase_date)) ||
            String(a.purchase_time ?? '').localeCompare(String(b.purchase_time ?? '')) ||
            a.position - b.position ||
            a.id.localeCompare(b.id),
        )
        .map((item) => {
          const parent = parentById.get(item.transaction_id);
          return copy({
            ...item,
            parent_type: parent?.type ?? null,
            parent_tag_id: parent?.tag_id ?? null,
            parent_description: parent?.description ?? null,
            parent_budget_id: parent?.budget_id ?? null,
            parent_transaction_date: parent?.transaction_date ?? null,
            parent_payment_due_date: parent?.payment_due_date ?? null,
          });
        });
    },

    async listTransactionsByDueDateRange(startIso, endIso) {
      const archived = archivedBudgetIds();
      return store.transactions
        .filter(
          (transaction) =>
            !archived.has(transaction.budget_id) &&
            transaction.payment_due_date != null &&
            transaction.payment_due_date >= startIso &&
            transaction.payment_due_date <= endIso,
        )
        .sort(
          (a, b) =>
            String(a.payment_due_date).localeCompare(String(b.payment_due_date)) ||
            String(b.created_at).localeCompare(String(a.created_at)),
        )
        .map(copy);
    },

    async deleteSubTransactionsForParent(transactionId) {
      const before = store.subTransactions.length;
      store.subTransactions = store.subTransactions.filter(
        (item) => item.transaction_id !== transactionId,
      );
      return before - store.subTransactions.length;
    },

    // --- reminders -----------------------------------------------------

    /**
     * Same projection as the SQLite LEFT JOIN: reminder row + transaction
     * fields, or NULL transaction fields for a standalone reminder. Reminders
     * tied to an archived budget are hidden unless `includeArchived` is asked
     * for, mirroring the SQLite budget join; the standalone ones belong to no
     * budget and are always kept.
     */
    async listReminders({ includeArchived = false } = {}) {
      const archived = includeArchived ? null : archivedBudgetIds();
      return store.reminders
        .map(projectReminder)
        .filter(
          (reminder) => !archived || reminder.budget_id == null || !archived.has(reminder.budget_id),
        )
        .sort((a, b) => a.remind_at.localeCompare(b.remind_at));
    },

    async getReminder(id) {
      return projectReminder(store.reminders.find((reminder) => reminder.id === id) ?? null);
    },

    /** The oldest reminder linked to a transaction, if any. */
    async getReminderByTransaction(transactionId) {
      if (transactionId == null) return null;
      return projectReminder(
        [...store.reminders]
          .filter((reminder) => reminder.transaction_id === transactionId)
          .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0] ??
          null,
      );
    },

    async insertReminder(row) {
      store.reminders.push({ ...row, status: row.status ?? 'active', notes: row.notes ?? '' });
    },

    async updateReminder(row) {
      const index = store.reminders.findIndex((reminder) => reminder.id === row.id);
      if (index < 0) return 0;
      const existing = store.reminders[index];
      // notes and status mirror SQLite's COALESCE: an omitted or null value
      // keeps what the row already holds, so notification-id bookkeeping can
      // never blank either one.
      store.reminders[index] = {
        ...existing,
        ...row,
        status: row.status == null ? existing.status : row.status,
        notes: row.notes == null ? existing.notes : row.notes,
      };
      return 1;
    },

    async deleteReminder(id) {
      const before = store.reminders.length;
      store.reminders = store.reminders.filter((reminder) => reminder.id !== id);
      return before - store.reminders.length;
    },

    /** Mirrors the subquery DELETE used before a budget is removed. */
    async deleteRemindersForBudget(budgetId) {
      const doomed = new Set(
        store.transactions
          .filter((transaction) => transaction.budget_id === budgetId)
          .map((t) => t.id),
      );
      const before = store.reminders.length;
      store.reminders = store.reminders.filter(
        (reminder) => !doomed.has(reminder.transaction_id),
      );
      return before - store.reminders.length;
    },

    // --- settings ------------------------------------------------------

    async getSetting(key, fallback = null) {
      return store.settings.has(key) ? store.settings.get(key) : fallback;
    },

    async setSetting(key, value) {
      store.settings.set(key, String(value));
    },

    async getAllSettings() {
      return Object.fromEntries(store.settings);
    },

    // --- accounts ------------------------------------------------------

    /** SQLite's `ORDER BY created_at ASC, id ASC`. */
    async listAccounts() {
      return [...store.accounts]
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
        .map(copy);
    },

    async insertAccount(row) {
      // Keys laid out in migrated column order so a read serializes like SELECT *.
      store.accounts.push({
        id: row.id,
        name: row.name,
        type: row.type ?? 'cash',
        initial_balance: row.initial_balance ?? 0,
        archived: row.archived ?? 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    },

    // --- full-row replacements (backup merge) --------------------------

    async replaceAccount(row) {
      const existing = store.accounts.find((account) => account.id === row.id);
      if (!existing) return 0;
      Object.assign(existing, {
        name: row.name,
        type: row.type ?? 'cash',
        initial_balance: row.initial_balance ?? 0,
        archived: row.archived ?? 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
      return 1;
    },

    async replaceBudget(row) {
      const existing = store.budgets.find((budget) => budget.id === row.id);
      if (!existing) return 0;
      Object.assign(existing, {
        name: row.name,
        start_date: row.start_date,
        end_date: row.end_date,
        color: row.color ?? null,
        folder_id: row.folder_id ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        deleted_at: row.deleted_at ?? null,
      });
      return 1;
    },

    async replaceFolder(row) {
      const existing = store.folders.find((folder) => folder.id === row.id);
      if (!existing) return 0;
      Object.assign(existing, {
        name: row.name,
        color: row.color ?? null,
        position: row.position ?? 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
      return 1;
    },

    async replaceTag(row) {
      const existing = store.tags.find((tag) => tag.id === row.id);
      if (!existing) return 0;
      Object.assign(existing, {
        name: row.name,
        emoji: row.emoji ?? null,
        color: row.color ?? null,
        is_default: row.is_default ?? 0,
        archived: row.archived ?? 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
      return 1;
    },

    async replaceTransaction(row) {
      const existing = store.transactions.find((transaction) => transaction.id === row.id);
      if (!existing) return 0;
      Object.assign(existing, {
        budget_id: row.budget_id,
        type: row.type,
        amount: row.amount,
        tag_id: row.tag_id ?? null,
        account_id: row.account_id ?? null,
        to_account_id: row.to_account_id ?? null,
        description: row.description ?? null,
        transaction_date: row.transaction_date,
        payment_status: row.payment_status ?? null,
        has_breakdown: row.has_breakdown ? 1 : 0,
        payment_due_date: row.payment_due_date ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
      return 1;
    },

    async replaceReminder(row) {
      const existing = store.reminders.find((reminder) => reminder.id === row.id);
      if (!existing) return 0;
      Object.assign(existing, {
        transaction_id: row.transaction_id ?? null,
        enabled: row.enabled ?? 1,
        status: row.status ?? 'active',
        remind_date: row.remind_date,
        remind_time: row.remind_time,
        remind_at: row.remind_at,
        notification_id: row.notification_id ?? null,
        notes: row.notes ?? '',
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
      return 1;
    },

    // --- backup restore -------------------------------------------------

    /** Empties every table, the demo seed included — mirrors DELETE FROM. */
    async clearAllData() {
      store.accounts = [];
      store.budgets = [];
      store.folders = [];
      store.tags = [];
      store.transactions = [];
      store.subTransactions = [];
      store.attachments = [];
      store.reminders = [];
      store.settings.clear();
    },
  };
}

/** Same six rows the SQLite migration seeds, via the same constant. */
function seedDefaultTags(store, timestamp) {
  for (const tag of DEFAULT_TAGS) {
    const id = `default_${tag.key}`;
    if (store.tags.some((existing) => existing.id === id)) continue;
    store.tags.push({
      id,
      name: tag.name,
      emoji: tag.emoji,
      color: tag.color,
      is_default: 1,
      archived: 0,
      created_at: timestamp,
      updated_at: timestamp,
    });
  }
}

/**
 * Web-only sample data so every screen renders populated during visual
 * testing. Native installs start empty and are never touched by this.
 */
function seedDemoData(store, timestamp) {
  if (store.budgets.length > 0) return;

  const current = suggestBudgetDates(0);
  const previous = suggestBudgetDates(-1);
  const today = toIsoDate(new Date());

  const budgets = [
    { id: 'demo_budget_current', ...current },
    { id: 'demo_budget_previous', ...previous },
  ].map((entry) => ({
    id: entry.id,
    name: entry.name,
    start_date: entry.startDate,
    end_date: entry.endDate,
    color: null,
    created_at: timestamp,
    updated_at: timestamp,
    folder_id: null,
    position: 0,
  }));

  store.budgets.push(...budgets);

  const transactions = [
    tx(budgets[0], 'income', 4_000_000, 'default_work', 'Salary', budgets[0].start_date),
    tx(budgets[0], 'expense', 1_200_000, 'default_household', 'Apartment rent', budgets[0].start_date),
    tx(budgets[0], 'expense', 145_000, 'default_daily-expenses', 'Groceries', today),
    tx(budgets[0], 'expense', 320_000, 'default_education', 'Online course', today),
    tx(budgets[0], 'expense', 250_000, 'default_car', 'Fuel', yesterday()),
    tx(budgets[0], 'expense', 480_000, 'default_travel', 'Flight to Cebu', budgets[0].start_date, 'unpaid'),
    tx(budgets[1], 'income', 4_000_000, 'default_work', 'Salary', budgets[1].start_date),
    tx(budgets[1], 'expense', 1_200_000, 'default_household', 'Apartment rent', budgets[1].start_date),
    tx(budgets[1], 'expense', 98_000, 'default_daily-expenses', 'Groceries', budgets[1].end_date),
  ];

  store.transactions.push(...transactions);

  // A breakdown expense so the browser harness shows the feature populated:
  // two positive items and one negative adjustment summing to the parent's
  // amount, in a persisted order.
  const groceries = transactions.find((entry) => entry.description === 'Groceries');
  if (groceries) {
    groceries.has_breakdown = 1;
    store.subTransactions.push(
      {
        id: 'demo_sub_rice',
        transaction_id: groceries.id,
        description: 'Rice 5kg',
        amount: 100_000,
        position: 0,
        purchase_date: today,
        purchase_time: '09:15',
        notes: null,
        created_at: timestamp,
        updated_at: timestamp,
      },
      {
        id: 'demo_sub_fruit',
        transaction_id: groceries.id,
        description: 'Fresh fruit',
        amount: 50_000,
        position: 1,
        purchase_date: today,
        purchase_time: '09:40',
        notes: null,
        created_at: timestamp,
        updated_at: timestamp,
      },
      {
        id: 'demo_sub_discount',
        transaction_id: groceries.id,
        description: 'Loyalty discount',
        amount: -5_000,
        position: 2,
        purchase_date: yesterday(),
        purchase_time: null,
        notes: 'Card promo, applied to the next receipt.',
        created_at: timestamp,
        updated_at: timestamp,
      },
    );
    groceries.payment_due_date = today;
  }

  // A plain expense with a reminder, so the browser harness shows the reminder
  // editor populated instead of always empty.
  const reminderDate = addDaysIso(today, 10);
  store.transactions.push({
    id: 'demo_tx_reminder',
    budget_id: budgets[0].id,
    type: 'expense',
    amount: 200_000, // ₱2,000.00
    tag_id: 'default_daily-expenses',
    account_id: null,
    to_account_id: null,
    description: 'Internet bill',
    transaction_date: today,
    payment_status: 'unpaid',
    has_breakdown: 0,
    created_at: timestamp,
    updated_at: timestamp,
  });
  store.reminders.push({
    id: 'demo_reminder_bill',
    transaction_id: 'demo_tx_reminder',
    notes: 'Reload the prepaid wifi before it cuts out.',
    enabled: 1,
    status: 'active',
    remind_date: reminderDate,
    remind_time: '09:00',
    remind_at: buildRemindAt(reminderDate, '09:00'),
    notification_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  });

  // A standalone reminder with no transaction, so the Calendar tab's reminder
  // editor shows both shapes in the browser harness.
  const standaloneDate = addDaysIso(today, 3);
  store.reminders.push({
    id: 'demo_reminder_standalone',
    transaction_id: null,
    notes: 'Submit the travel expense report.',
    enabled: 1,
    status: 'active',
    remind_date: standaloneDate,
    remind_time: '14:00',
    remind_at: buildRemindAt(standaloneDate, '14:00'),
    notification_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  });

  function tx(budget, type, amount, tagId, description, date, paymentStatus) {
    return {
      id: createId('tx'),
      budget_id: budget.id,
      type,
      amount,
      tag_id: tagId,
      account_id: null,
      to_account_id: null,
      description,
      transaction_date: date,
      // Mirrors the migration backfill: historical expenses read as paid.
      payment_status:
        paymentStatus ?? (type === 'expense' ? 'paid' : null),
      has_breakdown: 0,
      created_at: timestamp,
      updated_at: timestamp,
    };
  }
}

function yesterday() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return toIsoDate(date);
}
/**
 * Storage side of single-budget export/import.
 *
 * Every function takes the adapter explicitly instead of importing the
 * platform singleton, so the same code runs against SQLite on device, the
 * memory adapter in the browser, and a memory adapter in the verification
 * scripts. All writes happen inside one adapter transaction: a failed import
 * leaves no budget, tag, transaction, reminder or attachment row behind.
 */

const RECEIPT_PATH_RE = /^receipts\/[\w.-]+$/;

/**
 * Everything a budget file may contain. Only active budgets are exportable:
 * the Budget screen never opens an archived one, and the format has no
 * archive semantics of its own.
 */
export async function readBudgetTransferSource(store, budgetId) {
  const budget = await store.getBudget(budgetId);
  if (!budget || budget.deleted_at != null) return null;

  const transactions = await store.listTransactionsByBudget(budgetId);
  const transactionIds = transactions.map((row) => row.id);

  const [allTags, breakdownItems, reminders, attachments] = await Promise.all([
    store.listTags({ includeArchived: true }),
    store.listSubTransactionsByBudget(budgetId),
    store.listRemindersForBudget(budgetId, { includeArchived: true }),
    store.listAttachmentsForParents(transactionIds),
  ]);

  const referencedTagIds = new Set(transactions.map((row) => row.tag_id).filter(Boolean));
  const tags = allTags.filter((tag) => referencedTagIds.has(tag.id));

  const transactionIdSet = new Set(transactionIds);
  const linkedReminders = reminders.filter((reminder) =>
    transactionIdSet.has(reminder.transaction_id),
  );

  return {
    budget,
    transactions,
    breakdownItems,
    tags,
    reminders: linkedReminders,
    attachments,
  };
}

/** Existing names/tags the import planner needs; the repository never guesses. */
export async function readBudgetImportContext(store) {
  const [tags, budgets] = await Promise.all([
    store.listTags({ includeArchived: true }),
    store.listBudgets({ includeArchived: true }),
  ]);
  return {
    existingTags: tags,
    existingBudgetNames: budgets.map((budget) => budget.name),
  };
}

function nextPosition(budgets, folderId) {
  const scope = budgets.filter((budget) => (budget.folder_id ?? null) === (folderId ?? null));
  return scope.reduce((max, budget) => Math.max(max, budget.position ?? 0), -1) + 1;
}

/**
 * Insert a planned import atomically. `plan` comes from `planBudgetImport`;
 * its attachment rows must already carry an app-managed `path` written by the
 * service. Any throw rolls every row back, so callers only have to clean up
 * receipt files they wrote before calling this.
 */
export async function applyBudgetTransferImport(store, plan, { folderId = null } = {}) {
  for (const attachment of plan.attachments) {
    if (!RECEIPT_PATH_RE.test(String(attachment.path ?? ''))) {
      throw new Error('An imported receipt image has an invalid path.');
    }
  }

  const budgets = await store.listBudgets();
  const budgetRow = {
    ...plan.budget,
    folder_id: folderId ?? null,
    position: nextPosition(budgets, folderId),
  };

  await store.beginTransaction();
  try {
    await store.insertBudget(budgetRow);
    for (const tag of plan.tags) await store.insertTag(tag);
    for (const transaction of plan.transactions) await store.insertTransaction(transaction);
    for (const item of plan.breakdownItems) await store.insertSubTransaction(item);
    for (const reminder of plan.reminders) await store.insertReminder(reminder);
    for (const attachment of plan.attachments) {
      await store.insertAttachment({
        id: attachment.id,
        transaction_id: attachment.transaction_id,
        path: attachment.path,
        created_at: plan.budget.created_at,
        updated_at: plan.budget.updated_at,
      });
    }
    await store.commitTransaction();
  } catch (error) {
    await store.rollbackTransaction();
    throw error;
  }

  return budgetRow;
}

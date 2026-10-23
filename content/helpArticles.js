/**
 * Help & Guide article content — bundled with the app, so the whole guide
 * works offline and changes here ship with the next release (no network,
 * no CMS, no separate asset step).
 *
 * Content is deliberately data-only: every article is a list of typed
 * blocks rendered by app/help/[slug].jsx. Keep article text in sync with
 * what the app actually does — only implemented behaviour is documented,
 * and claims about platform limits (browser preview, Expo Go) match the
 * real gates in the code.
 *
 * Block shapes:
 *   { type: 'p', text }              — a paragraph
 *   { type: 'h', text }              — a sub-heading inside an article
 *   { type: 'steps', items: [...] }  — a numbered list of actions
 */

export const HELP_CATEGORIES = [
  {
    key: 'getting-started',
    title: 'Getting Started',
    icon: 'wallet',
    articles: [
      {
        id: 'creating-budgets',
        title: 'Creating a budget',
        summary: 'A budget is a period for your money, not a spending cap.',
        blocks: [
          {
            type: 'p',
            text: 'A Budgetarian budget is a named period — a month, a trip, a project — with a start and an end date. Income and expenses are recorded inside it, and every figure you see is derived from those entries. There is deliberately no budget limit to set and no “over budget” state: the Remaining figure simply tells you what the recorded numbers add up to.',
          },
          {
            type: 'h',
            text: 'Make your first budget',
          },
          {
            type: 'steps',
            items: [
              'Open the Budgets tab and tap the add button.',
              'Give the budget a name you will recognise, like “October 2026”.',
              'Set the dates it covers — the start and end of the period.',
              'Optionally choose a folder to group it in and a colour for it.',
              'Save. The new budget is ready for its first transactions.',
            ],
          },
          {
            type: 'p',
            text: 'Budgets you no longer need can be archived instead of deleted, so past figures stay reachable. See “Archiving and restoring budgets” under Archive.',
          },
        ],
      },
      {
        id: 'organizing-folders',
        title: 'Organizing budgets with folders',
        summary: 'Optional groups for your budgets — by year, purpose, anything.',
        blocks: [
          {
            type: 'p',
            text: 'Folders are an optional way to group budgets. You name them however you like — “2026”, “Travel”, “Business” — and each folder can carry its own colour. Folders are purely organisational: they hold no money of their own and change nothing about how a budget is calculated.',
          },
          {
            type: 'h',
            text: 'How they behave',
          },
          {
            type: 'steps',
            items: [
              'A budget either sits in one folder or stays ungrouped at the top level — never in two folders at once.',
              'Moving a budget between folders keeps every transaction, attachment, reminder and tag exactly as it was.',
              'Deleting a folder does not delete the budgets inside: they move to the Archive with every record intact, ready to be restored — they come back at the top level.',
              'Folders cannot contain other folders.',
            ],
          },
          {
            type: 'p',
            text: 'A folder named after a year is still just a label: it does not filter dates or archive anything by itself. Open a folder to see its budgets, or start a new one directly inside it.',
          },
        ],
      },
      {
        id: 'understanding-remaining',
        title: 'Understanding remaining balances',
        summary: 'Where every “remaining” number comes from.',
        blocks: [
          {
            type: 'p',
            text: 'For each budget, Remaining = income recorded in it − expenses recorded in it. The Home screen shows each budget’s remaining alongside its name, plus a combined figure across your active budgets. Nothing is stored as a “balance” — it is always recalculated from your transactions, so it can never drift out of sync.',
          },
          {
            type: 'h',
            text: 'Reading the numbers',
          },
          {
            type: 'steps',
            items: [
              'A remaining figure turns red when a budget has income recorded and its expenses have taken it below zero.',
              'Archived budgets are excluded from the totals on Home.',
              'Split transactions (breakdowns) are counted once, as their parent entry — the parts do not double the total.',
            ],
          },
        ],
      },
    ],
  },
  {
    key: 'transactions',
    title: 'Transactions',
    icon: 'bills',
    articles: [
      {
        id: 'recording-income-expenses',
        title: 'Recording income and expenses',
        summary: 'The core entry: an amount, a date, and whatever detail you want.',
        blocks: [
          {
            type: 'steps',
            items: [
              'Open a budget and add a transaction.',
              'Choose income or expense and enter the amount.',
              'Write a description — “Groceries”, “rent”, “salary” — and set the date.',
              'Optionally add tags, a breakdown, receipt photos, or a reminder.',
              'Save the transaction. While editing an existing entry, changes are saved for you as you leave the screen.',
            ],
          },
          {
            type: 'h',
            text: 'Paid or unpaid',
          },
          {
            type: 'p',
            text: 'Expenses can be marked paid or unpaid, and an unpaid expense can carry a due date — useful for a bill you have recorded but not yet settled. Income is not tracked as paid or unpaid; it is simply recorded.',
          },
        ],
      },
      {
        id: 'breakdowns',
        title: 'Splitting a transaction with a breakdown',
        summary: 'One payment, several parts — and the parts can be reordered.',
        blocks: [
          {
            type: 'p',
            text: 'A breakdown splits a single transaction into named parts — the separate items on one receipt, for example. Turn the breakdown on in the transaction form and add each part with its own amount and detail.',
          },
          {
            type: 'steps',
            items: [
              'In the transaction form, switch the breakdown on.',
              'Add an item for each part of the payment.',
              'Drag the handle on a row to reorder items.',
              'Save the transaction. Reports and summaries count the transaction as a whole; the breakdown keeps the detail.',
            ],
          },
          {
            type: 'p',
            text: 'Deleting a breakdown item offers Undo on the way out, so a mis-tap is never silent.',
          },
        ],
      },
      {
        id: 'tags',
        title: 'Grouping with tags',
        summary: 'One shared tag library, used across every budget.',
        blocks: [
          {
            type: 'p',
            text: 'Tags are labels — with an emoji and a colour — that you attach to transactions to group them across budgets: Groceries, Transport, Salary. Six starter tags are ready when you install; you can manage the library from Settings → Manage tags, adding your own and removing what you do not use.',
          },
          {
            type: 'steps',
            items: [
              'Open Settings → Manage tags to create, edit or remove tags.',
              'In a transaction, tap the tags you want. Recently used tags float to the front of the list.',
              'Use tags on other screens too — transactions you search or filter can be found by their tag.',
            ],
          },
        ],
      },
      {
        id: 'receipt-photos',
        title: 'Attaching receipt photos',
        summary: 'Take a photo or pick from the gallery; share receipts in from other apps.',
        blocks: [
          {
            type: 'p',
            text: 'Any transaction can carry receipt images. In the Attachments section there are two ways in:',
          },
          {
            type: 'steps',
            items: [
              'Take Photo — the device camera opens; after the shot, the image is staged exactly like a gallery pick.',
              'Choose from Gallery — pick existing images from your photos.',
              'You can also share a receipt image (or text) from another app straight into Budgetarian, which opens the Import Receipt screen.',
            ],
          },
          {
            type: 'h',
            text: 'How attachments are stored',
          },
          {
            type: 'p',
            text: 'Images are copied into Budgetarian’s own app storage when they are attached, so a photo survives even if the original in your gallery is deleted. On a new transaction, attaching does not save anything: the receipt appears immediately, and it becomes permanent only when you save the transaction. Cancelling the camera, or backing out, leaves everything unchanged. Tap any attachment to view it full size; remove it any time from the same row.',
          },
          {
            type: 'h',
            text: 'Reading text from a receipt',
          },
          {
            type: 'p',
            text: 'When a receipt is attached to a new transaction, Budgetarian reads the text printed on it entirely on your device — the image is never uploaded anywhere. Recognised lines appear as a list under the preview. Tap a line to put it into a field — amount, date or description — and nothing is filled in unless you choose it. The reader needs the installed app; it is not available in the browser preview.',
          },
        ],
      },
    ],
  },
  {
    key: 'reminders',
    title: 'Reminders',
    icon: 'clock',
    articles: [
      {
        id: 'creating-reminders',
        title: 'Creating and editing reminders',
        summary: 'A date, a time, a note — and optionally a transaction to remember.',
        blocks: [
          {
            type: 'steps',
            items: [
              'Start a reminder from the Calendar tab (tap a day), from a transaction, or from the Home reminders.',
              'Set the date and time it is due.',
              'Write a note — what needs doing, in your words.',
              'Optionally link a transaction, so the reminder points straight at the entry it belongs to.',
              'Save. Editing later is the same form: change any field, mark it completed, or delete it.',
            ],
          },
          {
            type: 'p',
            text: 'Reminders are always saved to the device, even while notifications are turned off — they simply cannot notify until permission is allowed in Settings.',
          },
        ],
      },
      {
        id: 'completing-reminders',
        title: 'Completing or postponing a reminder',
        summary: 'Answer the notification without opening the app.',
        blocks: [
          {
            type: 'p',
            text: 'When a reminder’s notification arrives it carries two buttons:',
          },
          {
            type: 'steps',
            items: [
              'Complete — that reminder is marked done, its notification is dismissed, and it will not come back on the next launch. The linked transaction’s own paid status is untouched.',
              'Remind Later — a quick ten-minute postponement: the same reminder moves forward in time with its note and link intact, and the old notification is cancelled so it cannot fire again.',
            ],
          },
          {
            type: 'p',
            text: 'For a different wait, open the reminder and edit its date and time instead — the notification button always takes the quick ten minutes. Pressing a button twice, or on a stale notification, is safe: the duplicate is ignored.',
          },
        ],
      },
    ],
  },
  {
    key: 'archive',
    title: 'Archive',
    icon: 'archive',
    articles: [
      {
        id: 'archiving-restoring',
        title: 'Archiving and restoring budgets',
        summary: 'Put finished periods away — losslessly — or bring them back.',
        blocks: [
          {
            type: 'p',
            text: 'Archiving hides a budget from your active lists without deleting anything. Its transactions, breakdowns, attachments, reminders, tags and colour are all preserved, so restoring is lossless. Archived budgets stop counting toward Home totals and reports.',
          },
          {
            type: 'h',
            text: 'Archive',
          },
          {
            type: 'steps',
            items: [
              'From a budget’s own screen, or by selecting budgets on the Budgets tab (whole folders can be archived at once too).',
              'Confirm — the budgets move to the Archive. A brief Undo appears if you change your mind immediately.',
            ],
          },
          {
            type: 'h',
            text: 'Restore',
          },
          {
            type: 'steps',
            items: [
              'Open the Archive from the Budgets tab.',
              'Restore the budget. It returns to exactly the folder it was in, with all its data.',
            ],
          },
          {
            type: 'p',
            text: 'Deleting from the Archive screen is the permanent step — the budget and its records go with it. When a folder is deleted, its budgets are archived rather than lost, and stay restorable.',
          },
        ],
      },
    ],
  },
  {
    key: 'data-privacy',
    title: 'Data & Privacy',
    icon: 'database',
    articles: [
      {
        id: 'export-backups',
        title: 'Exporting a backup',
        summary: 'One JSON file with your records, saved wherever you choose.',
        blocks: [
          {
            type: 'steps',
            items: [
              'Open Settings → Export & Import.',
              'Tap Save backup file, then choose where to put it — Files, Drive, or any app you share to.',
              'Keep the file somewhere safe. It is a plain document you own.',
            ],
          },
          {
            type: 'p',
            text: 'A backup carries your folders, budgets, transactions, breakdowns, tags, reminders and preferences. Receipt images are not inside the file — attachments stay on the device, so a backup restores the records but images live only in the app’s storage.',
          },
        ],
      },
      {
        id: 'restoring-merging',
        title: 'Restoring a backup — merge or replace',
        summary: 'Preview first, then merge carefully or restore fully.',
        blocks: [
          {
            type: 'p',
            text: 'Importing a backup always shows a preview — how many folders, budgets, transactions, tags and reminders the file contains — before anything on the device changes. From there you have two choices.',
          },
          {
            type: 'h',
            text: 'Merge with my data',
          },
          {
            type: 'steps',
            items: [
              'Choose Merge with my data on the preview.',
              'Review the merge: records that exist only in the backup are added; anything that clashes is listed as a conflict for you to settle one by one. When nothing clashes, the screen says so — the merge only adds new records.',
              'Apply the merge.',
            ],
          },
          {
            type: 'h',
            text: 'Full restore',
          },
          {
            type: 'p',
            text: 'Full restore replaces what is on the device with the contents of the backup file. Use it on a fresh install, or when you know the file is more complete than the phone. As always, restoring brings back records — receipt images from the old device do not travel in the file.',
          },
        ],
      },
      {
        id: 'local-data',
        title: 'Where your data lives',
        summary: 'On this device, offline by design — nothing is uploaded.',
        blocks: [
          {
            type: 'p',
            text: 'Budgetarian has no account, no sign-in and no backend. Your budgets, transactions and everything else are kept in a database inside the app’s own storage on this device, and the app works fully offline. Receipt photos are copied into that same on-device storage. Nothing — records or images — is sent anywhere by the app; the only files that leave are backups you choose to save yourself.',
          },
          {
            type: 'steps',
            items: [
              'Reinstalling the app, or clearing its storage, removes the local data — export a backup before doing either, and import it after.',
              'The browser preview is a demo that runs on sample data in memory; it never writes to a real database, and nothing you do there is saved.',
            ],
          },
        ],
      },
    ],
  },
  {
    key: 'troubleshooting',
    title: 'Troubleshooting',
    icon: 'warning',
    articles: [
      {
        id: 'reminders-not-firing',
        title: 'A reminder did not notify',
        summary: 'Permission first, then battery behaviour.',
        blocks: [
          {
            type: 'steps',
            items: [
              'Check Settings → Reminder notifications is on. If it shows blocked, use the Open device settings shortcut there and allow notifications for the app.',
              'Remember that reminders are still saved while notifications are off — they simply cannot make a sound.',
              'Aggressive battery saving on some Android phones can delay notifications or stop scheduled ones while the app is closed. Keeping Budgetarian exempt from battery optimisation gives the most punctual results.',
              'Reopening the app always re-checks everything: due and overdue reminders show on Home, and future ones are re-armed.',
            ],
          },
        ],
      },
      {
        id: 'camera-photos-issues',
        title: 'Camera or photo problems',
        summary: 'Denied permission, unreadable captures, browser limits.',
        blocks: [
          {
            type: 'steps',
            items: [
              'Camera access was denied: you can allow it again in the device settings for Budgetarian — the app shows an Open Settings shortcut for exactly this case. Until then, Choose from Gallery keeps working.',
              'The camera closed but no image appeared: nothing was changed and nothing was saved — attach the photo again.',
              'A receipt image will not display after a restore: images do not travel inside backup files (see “Exporting a backup”), so the record shows with the image missing until you re-attach it.',
              'The browser preview has no camera, no gallery picker and no attachments — those parts of the flow belong to the installed app.',
            ],
          },
        ],
      },
      {
        id: 'storage-problems',
        title: '“Could not open local storage”',
        summary: 'The start-up guard and what to do if it stays up.',
        blocks: [
          {
            type: 'p',
            text: 'Budgetarian refuses to start screens until its local database is ready, and shows this message instead of a half-working app. Tap Try again first — a momentary storage problem often clears on the second attempt.',
          },
          {
            type: 'steps',
            items: [
              'Free up device storage — a full device can block the database from opening.',
              'Restart the phone and open the app again.',
              'If it still fails, reinstalling the app is the way back — and that is why regular backups matter: import your latest file after reinstalling.',
            ],
          },
        ],
      },
      {
        id: 'shared-receipt-not-arriving',
        title: 'A shared receipt did not arrive',
        summary: 'Sharing needs the installed app, and the Import screen needs a retry path.',
        blocks: [
          {
            type: 'steps',
            items: [
              'Share from the other app to “Budgetarian” specifically — the first entry in the share sheet is not always the app you mean.',
              'Receipt sharing needs the installed app; it does not arrive through Expo Go or the browser preview.',
              'If the Import Receipt screen says the receipt could not be received, tap Try again before leaving the screen.',
              'Anything that still does not arrive can always be attached by hand: save the image, then use Choose from Gallery on the transaction.',
            ],
          },
        ],
      },
    ],
  },
  {
    key: 'feedback',
    title: 'Feedback & Support',
    icon: 'mail',
    articles: [
      {
        id: 'contact-developer',
        title: 'Sharing feedback or reporting a problem',
        summary: 'Direct to the developer — with no financial data attached.',
        blocks: [
          {
            type: 'p',
            text: 'Budgetarian is made by an individual developer (James Jomuad), and feedback goes to him directly. What helps most: what you were doing, the exact steps that led there, and roughly which version of the app you have.',
          },
          {
            type: 'steps',
            items: [
              'Where a contact action is available on this screen, it opens your own mail app with a blank message to the developer.',
              'Nothing is ever attached automatically: no records, no transactions, no receipt images. If a screenshot genuinely explains a bug, attach it yourself — and prefer one that shows no amounts.',
              'If your data is involved in the problem, export a backup before reinstalling or clearing anything, and keep that file.',
            ],
          },
          {
            type: 'h',
            text: 'For the developer of this install',
          },
          {
            type: 'p',
            text: 'A contact action appears once a support address is configured in constants/support.js (SUPPORT_EMAIL). Until that is filled in, no contact button is shown — rather than a broken one.',
          },
        ],
      },
    ],
  },
];

/** All articles across every category, in list order. */
export function getAllArticles() {
  return HELP_CATEGORIES.flatMap((category) =>
    category.articles.map((article) => ({ category, article })),
  );
}

/** One article by its id, or null when the id is unknown. */
export function getArticle(id) {
  for (const category of HELP_CATEGORIES) {
    const found = category.articles.find((article) => article.id === id);
    if (found) return found;
  }
  return null;
}

function articleHaystack(article) {
  const text = article.blocks
    .map((block) => `${block.text ?? ''} ${(block.items ?? []).join(' ')}`)
    .join(' ');
  return `${article.title} ${article.summary} ${text}`.toLowerCase();
}

/**
 * Case-insensitive search over titles, summaries and body text. Matching is
 * deliberately plain substring work — bundled content, no indexes needed.
 */
export function searchArticles(query) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) return getAllArticles();
  return getAllArticles().filter(
    ({ article }) => articleHaystack(article).indexOf(needle) !== -1,
  );
}

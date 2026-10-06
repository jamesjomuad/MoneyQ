import { storage } from '../adapters/adapter';
import { DEFAULT_TAG_EMOJI, DEFAULT_TAGS } from '../../constants/finance';
import { tagColors } from '../../constants/colors';
import { createId, nowIso } from '../../utils/id';

/**
 * Tags are a single global library reused by every budget, so there is no
 * join table and no per-budget copy to keep in sync.
 */
export async function getTags({ includeArchived = false } = {}) {
  return storage.listTags({ includeArchived });
}

export async function getTag(id) {
  return storage.getTag(id);
}

export async function countTransactionsUsingTag(tagId) {
  return storage.countTransactionsUsingTag(tagId);
}

export async function createTag({ name, emoji, color } = {}) {
  const id = createId('tag');
  const timestamp = nowIso();
  const trimmed = String(name ?? '').trim();

  if (!trimmed) throw new Error('A tag needs a name.');
  if (trimmed.length > 40) throw new Error('Tag names must be 40 characters or fewer.');

  const existing = await storage.findTagByName(trimmed);
  if (existing) throw new Error(`A tag named "${trimmed}" already exists.`);

  const chosenColor = color ?? tagColors[DEFAULT_TAGS.length % tagColors.length];

  await storage.insertTag({
    id,
    name: trimmed,
    emoji: emoji || DEFAULT_TAG_EMOJI,
    color: chosenColor,
    is_default: 0,
    archived: 0,
    created_at: timestamp,
    updated_at: timestamp,
  });

  return getTag(id);
}

export async function updateTag(id, { name, emoji, color } = {}) {
  const current = await getTag(id);
  if (!current) throw new Error('That tag no longer exists.');

  const nextName = name === undefined ? current.name : String(name).trim();
  if (!nextName) throw new Error('A tag needs a name.');
  if (nextName.length > 40) throw new Error('Tag names must be 40 characters or fewer.');

  const clash = await storage.findTagByName(nextName, id);
  if (clash) throw new Error(`A tag named "${nextName}" already exists.`);

  await storage.updateTag({
    id,
    name: nextName,
    emoji: emoji === undefined ? current.emoji : emoji || DEFAULT_TAG_EMOJI,
    color: color === undefined ? current.color : color,
    updated_at: nowIso(),
  });

  return getTag(id);
}

/**
 * Hard delete. Transactions keep their amount but lose their tag, because the
 * foreign key is ON DELETE SET NULL.
 */
export async function deleteTag(id) {
  return storage.deleteTag(id);
}

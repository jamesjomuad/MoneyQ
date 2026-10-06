/**
 * Locally generated identifiers. The MVP has no server issuing IDs, so these
 * must be unique within the device database for the lifetime of the app.
 */
export function createId(prefix = '') {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  const suffix = Math.random().toString(36).slice(2, 6);
  const id = `${time}${random}${suffix}`;
  return prefix ? `${prefix}_${id}` : id;
}

export function nowIso() {
  return new Date().toISOString();
}
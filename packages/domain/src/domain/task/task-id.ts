// Short, human-friendly form of a task id — pure, no I/O.

const GENERATED_ID = /^\d{10,}-([a-z0-9]+)$/

/**
 * The part of a task id worth showing in a card or a list.
 *
 * Generated ids are `<timestamp>-<random>`: their first characters are the
 * same for every task created within days of each other, so the random
 * suffix is what tells them apart. Any other id (imported, UUID) is cut to
 * its first 8 characters.
 */
export function shortTaskId(id: string): string {
  return GENERATED_ID.exec(id)?.[1] ?? id.slice(0, 8)
}

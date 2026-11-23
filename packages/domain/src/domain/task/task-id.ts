// Short, human-friendly form of a task id — pure, no I/O.

const GENERATED_ID = /^\d{10,}-([a-z0-9]+)$/

/**
 * The part of a task id worth showing in a card or a list.
 *
 * Generated ids are `<timestamp>-<random>`: their first characters are the
 * same for every task created within days of each other, so the random
 * suffix is what tells them apart. Short ids (up to 12 characters, e.g.
 * imported "PROJ-1042") are already readable and kept whole: cutting them
 * made siblings like "x-t140".."x-t149" collide. Longer ids (UUIDs) are cut
 * to their first 8 characters.
 */
export function shortTaskId(id: string): string {
  const generated = GENERATED_ID.exec(id)?.[1]
  if (generated) return generated
  return id.length <= 12 ? id : id.slice(0, 8)
}

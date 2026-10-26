/**
 * Writes `VALUE (note)` for each entry, or the bare value when its note is empty, in the order
 * the entries were written.
 *
 * Callers declare the entries with `satisfies Record<SomeEnum, string>`, where `SomeEnum` comes
 * from the generated enums. A value the engine adds or drops then fails the build at that object,
 * instead of leaving a help line that lists the old set.
 */
export function withNotes(notes: Record<string, string>): string[] {
  return Object.entries(notes).map(([value, note]) => (note ? `${value} (${note})` : value));
}

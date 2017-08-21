/* @flow */

// Replace the date with an ellipsis in a conflict file name.
// Useful to write test assertions checking the local/remote filesystem.
export function ellipsizeDate (path: string): string {
  return path.replace(/-conflict-[^/]+/, '-conflict-...')
}

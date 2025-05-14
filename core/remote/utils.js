function sortByPath /*::<T: $ReadOnlyArray<CouchDBDoc|CouchDBDeletion>> */(
  docs /*: T */
) /*: T */ {
  // XXX: We copy the array because `Array.sort()` mutates it and we're supposed
  // to deal with read-only arrays (because it's an array of union type values
  // and Flow will complain if a value can change type).
  return [...docs].sort(byPath)
}

function byPath(
  docA /*: CouchDBDoc|CouchDBDeletion */,
  docB /*: CouchDBDoc|CouchDBDeletion */
) {
  if (!docA._deleted && !docB._deleted) {
    if (docA.path < docB.path) return -1
    if (docA.path > docB.path) return 1
  } else if (docA._deleted && !docB._deleted) {
    return -1
  } else if (docB._deleted && !docA._deleted) {
    return 1
  }
  return 0
}

/**
 * @function
 * @description Template tag function for URIs encoding
 *
 * Will automatically apply `encodeURIComponent` to template literal placeholders
 *
 * @example
 * ```
 * const safe = uri`/data/${doctype}/_all_docs?limit=${limit}`
 * ```
 *
 * @private
 */
function uri(strings, ...values) {
  const parts = [strings[0]]
  for (let i = 0; i < values.length; i++) {
    parts.push(encodeURIComponent(values[i]) + strings[i + 1])
  }
  return parts.join('')
}

module.exports = {
  sortByPath,
  uri
}

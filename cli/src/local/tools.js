/* @flow */

import { find } from 'lodash'

// scan files with same checksum (sameChecksums) for any file which
// - does not exists anymore (in initialScan)
// - has an pendingDeletion for the same path (otherwise)
// @TODO duck typing of pendingDeletions

export const findAndRemove = <T>(arr: T[], predicate: (T) => bool): ?T => {
  let x = find(arr, predicate)
  if (x != null) {
    arr.splice(arr.indexOf(x), 1)
  }
  return x
}

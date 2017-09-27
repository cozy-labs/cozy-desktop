/* @flow */

import type { ChokidarFSEvent } from './chokidar_event'
import type { Metadata } from '../metadata'
import fs from 'fs'
import find from 'lodash.find'

// scan files with same checksum (sameChecksums) for any file which
// - does not exists anymore (in initialScan)
// - has an pendingDeletion for the same path (otherwise)
export const findOldDoc = (initialScan: boolean, sameChecksums: Metadata[], pendingDeletions: ChokidarFSEvent[]): ?Metadata => {
  for (let sameChecksum of sameChecksums) {
    if (initialScan) {
      if (!fs.existsSync(sameChecksum.path)) return sameChecksum
    } else {
      for (let pendingDeletion of pendingDeletions) {
        if (pendingDeletion.path === sameChecksum.path) {
          pendingDeletions.splice(pendingDeletions.indexOf(pendingDeletion), 1)
          return sameChecksum
        }
      }
    }
  }

  return null
}

export const findAndRemove = <T>(arr: T[], predicate: (T) => bool): T => {
  let x = find(arr, predicate)
  if (x != null) {
    arr.splice(arr.indexOf(x), 1)
  }
  return x
}

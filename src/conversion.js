/* @flow */

import { DIR_TYPE, FILE_TYPE } from './remote/constants'

import type { RemoteDoc } from './remote/document'
import type { Metadata } from './metadata'

export function localDocType (remote: string): string {
  switch (remote) {
    case FILE_TYPE: return 'file'
    case DIR_TYPE: return 'folder'
    default: throw new Error(`Unexpected Cozy Files type: ${remote}`)
  }
}

// Transform a remote document into metadata, as stored in Pouch
export function createMetadata (remote: RemoteDoc): Metadata {
  let doc: Object = {
    path: remote.path,
    docType: localDocType(remote.type),
    creationDate: remote.created_at,
    lastModification: remote.updated_at,
    executable: remote.executable,
    remote: {
      _id: remote._id,
      _rev: remote._rev
    },
    sides: {
      remote: undefined,
      local: undefined
    }
  }

  if (remote.md5sum) {
    doc.checksum = remote.md5sum
  }

  for (let field of ['size', 'class', 'mime', 'tags']) {
    if (remote[field]) { doc[field] = remote[field] }
  }
  return doc
}

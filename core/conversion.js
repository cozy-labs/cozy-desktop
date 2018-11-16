/* @flow */

const path = require('path')

const { DIR_TYPE, FILE_TYPE } = require('./remote/constants')

/*::
import type { RemoteDoc } from './remote/document'
import type { Metadata } from './metadata'
*/

module.exports = {
  localDocType,
  createMetadata,
  extractDirAndName
}

function localDocType (remoteDocType /*: string */) /*: string */ {
  switch (remoteDocType) {
    case FILE_TYPE: return 'file'
    case DIR_TYPE: return 'folder'
    default: throw new Error(`Unexpected Cozy Files type: ${remoteDocType}`)
  }
}

// Transform a remote document into metadata, as stored in Pouch.
// Please note the path is not normalized yet!
// Normalization is done as a side effect of metadata.invalidPath() :/
function createMetadata (remoteDoc /*: RemoteDoc */) /*: Metadata */ {
  const doc /*: Object */ = {
    path: remoteDoc.path.substring(1),
    docType: localDocType(remoteDoc.type),
    updated_at: remoteDoc.updated_at,
    remote: {
      _id: remoteDoc._id,
      _rev: remoteDoc._rev
    }
  }

  if (remoteDoc.size) {
    doc.size = parseInt(remoteDoc.size, 10)
  }

  for (let field of ['md5sum', 'executable', 'class', 'mime', 'tags']) {
    if (remoteDoc[field]) { doc[field] = remoteDoc[field] }
  }

  return doc
}

// Extract the remote path and name from a local id
function extractDirAndName (id /*: string */) /*: [string, string] */ {
  const dir = '/' + id.split(path.sep).slice(0, -1).join('/')
  const name = path.basename(id)
  return [dir, name]
}

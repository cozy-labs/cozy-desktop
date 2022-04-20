/**
 * @module core/migrations/migrations
 * @flow
 */

const path = require('path')

const metadata = require('../metadata')
const { SCHEMA_INITIAL_VERSION } = require('./constants')

/*::
import type { SavedMetadata } from '../metadata'
import type { SchemaVersion } from './constants'
import type { InjectedDependencies } from './constants'

export type Migration = {
  baseSchemaVersion: SchemaVersion,
  targetSchemaVersion: SchemaVersion,
  description: string,
  affectedDocs: (SavedMetadata[]) => SavedMetadata[],
  run: (SavedMetadata[], InjectedDependencies) => Promise<SavedMetadata[]>
}
*/

module.exports = ([
  {
    baseSchemaVersion: SCHEMA_INITIAL_VERSION,
    targetSchemaVersion: 1,
    description: 'Adding sides.target with value of _rev',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(doc => doc.sides == null || doc.sides.target == null)
    },
    run: (docs /*: SavedMetadata[] */) /*: Promise<SavedMetadata[]> */ => {
      return Promise.resolve(
        docs.map(doc => {
          doc.sides = doc.sides || {}
          doc.sides.target = metadata.extractRevNumber(doc)
          return doc
        })
      )
    }
  },
  {
    baseSchemaVersion: 1,
    targetSchemaVersion: 2,
    description: 'Removing overwrite attribute of synced documents',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(
        doc =>
          doc.overwrite &&
          doc.sides &&
          doc.sides.target === doc.sides.local &&
          doc.sides.target === doc.sides.remote
      )
    },
    run: (docs /*: SavedMetadata[] */) /*: Promise<SavedMetadata[]> */ => {
      return Promise.resolve(
        docs.map(doc => {
          if (doc.overwrite) delete doc.overwrite
          return doc
        })
      )
    }
  },
  {
    baseSchemaVersion: 2,
    targetSchemaVersion: 3,
    description: 'Marking Cozy Notes for refetch to avoid conflicts',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(
        doc =>
          doc.mime === 'text/vnd.cozy.note+markdown' &&
          doc.metadata &&
          doc.metadata.content &&
          doc.sides &&
          doc.sides.local &&
          doc.sides.remote
      )
    },
    run: (docs /*: SavedMetadata[] */) /*: Promise<SavedMetadata[]> */ => {
      return Promise.resolve(
        docs.map(doc => {
          if (doc.sides && doc.sides.local && doc.sides.remote) {
            doc.sides.target =
              Math.max(doc.sides.target, doc.sides.local, doc.sides.remote) + 1
            doc.sides.remote = doc.sides.target
          }
          return doc
        })
      )
    }
  },
  {
    baseSchemaVersion: 3,
    targetSchemaVersion: 4,
    description: 'Generating files local Metadata info with current Metadata',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(doc => doc.docType === 'file')
    },
    run: (docs /*: SavedMetadata[] */) /*: Promise<SavedMetadata[]> */ => {
      return Promise.resolve(
        docs.map(doc => {
          // $FlowFixMe path was not present when this migration was created
          doc.local = {
            md5sum: doc.md5sum,
            class: doc.class,
            docType: 'file',
            executable: doc.executable,
            updated_at: doc.updated_at,
            mime: doc.mime,
            size: doc.size,
            ino: doc.ino,
            fileid: doc.fileid
          }
          return doc
        })
      )
    }
  },
  {
    baseSchemaVersion: 4,
    targetSchemaVersion: 5,
    description: 'Removing moveFrom attribute of synced documents',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(
        doc =>
          doc.moveFrom &&
          doc.sides &&
          doc.sides.target === doc.sides.local &&
          doc.sides.target === doc.sides.remote
      )
    },
    run: (docs /*: SavedMetadata[] */) /*: Promise<SavedMetadata[]> */ => {
      return Promise.resolve(
        docs.map(doc => {
          if (doc.moveFrom) delete doc.moveFrom
          return doc
        })
      )
    }
  },
  {
    baseSchemaVersion: 5,
    targetSchemaVersion: 6,
    description: 'Generating folders local Metadata info with current Metadata',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(doc => doc.docType === 'folders')
    },
    run: (docs /*: SavedMetadata[] */) /*: Promise<SavedMetadata[]> */ => {
      return Promise.resolve(
        docs.map(doc => {
          // $FlowFixMe path was not present when this migration was created
          doc.local = {
            docType: 'folder',
            updated_at: doc.updated_at,
            ino: doc.ino,
            fileid: doc.fileid
          }
          return doc
        })
      )
    }
  },
  {
    baseSchemaVersion: 6,
    targetSchemaVersion: 7,
    description: 'Add path to local and remote metadata',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(doc => doc.local != null || doc.remote != null)
    },
    run: (docs /*: SavedMetadata[] */) /*: Promise<SavedMetadata[]> */ => {
      return Promise.resolve(
        docs.map(doc => {
          if (doc.local) doc.local.path = doc.path
          if (doc.remote)
            doc.remote.path = '/' + path.posix.join(...doc.path.split(path.sep))
          return doc
        })
      )
    }
  },
  {
    baseSchemaVersion: 7,
    targetSchemaVersion: 8,
    description: 'Set all files executable attribute',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(
        doc => doc.docType === 'file' && doc.executable == null
      )
    },
    run: (docs /*: SavedMetadata[] */) /*: Promise<SavedMetadata[]> */ => {
      return Promise.resolve(
        docs.map(doc => {
          doc.executable = false
          if (doc.local && doc.local.executable == null) {
            doc.local.executable = false
          }
          return doc
        })
      )
    }
  },
  {
    baseSchemaVersion: 8,
    targetSchemaVersion: 9,
    description: 'Default tags attribute to an empty Array',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(doc => doc.docType != null && !doc.tags)
    },
    run: (docs /*: SavedMetadata[] */) /*: Promise<SavedMetadata[]> */ => {
      return Promise.resolve(
        docs.map(doc => {
          doc.tags = []
          return doc
        })
      )
    }
  },
  {
    baseSchemaVersion: 9,
    targetSchemaVersion: 10,
    description: 'Cleanup corrupted record sides',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(
        doc =>
          doc.sides &&
          ((doc.sides.local && !doc.local) || (doc.sides.remote && !doc.remote))
      )
    },
    run: (docs /*: SavedMetadata[] */) /*: Promise<SavedMetadata[]> */ => {
      return Promise.resolve(
        docs.map(doc => {
          if (doc.sides.local && !doc.local) {
            // Remove local side when no local attribute exists
            delete doc.sides.local
          }
          if (doc.sides.remote && !doc.remote) {
            // Remove remote side when no remote attribute exists
            delete doc.sides.remote
          }
          if (!doc.sides.local && !doc.sides.remote) {
            // Erase record is no sides are remaining
            doc._deleted = true
          }
          // Remove errors, in case this would result in a new Sync attempt
          delete doc.errors
          return doc
        })
      )
    }
  },
  {
    baseSchemaVersion: 10,
    targetSchemaVersion: 11,
    description: 'Add type attribute to pathMaxBytes incompatibilities',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(
        doc =>
          doc.incompatibilities &&
          doc.incompatibilities.find(issue => issue.type == null) != null
      )
    },
    run: (docs /*: SavedMetadata[] */) /*: Promise<SavedMetadata[]> */ => {
      return Promise.resolve(
        docs.map(doc => {
          if (doc.incompatibilities) {
            const issue = doc.incompatibilities.find(
              issue => issue.type == null
            )
            if (issue) {
              // $FlowFixMe `type` is not set so it can't be another value
              issue.type = 'pathMaxBytes'
            }
          }
          return doc
        })
      )
    }
  },
  {
    baseSchemaVersion: 11,
    targetSchemaVersion: 12,
    description: 'Remove unnecessary Windows path length incompatibilities',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      return docs.filter(
        doc =>
          doc.incompatibilities &&
          doc.incompatibilities.find(
            issue =>
              issue.platform === 'win32' &&
              issue.type === 'pathMaxBytes' &&
              issue.pathBytes <= 32766
          ) != null
      )
    },
    run: (docs /*: SavedMetadata[] */) /*: Promise<SavedMetadata[]> */ => {
      return Promise.resolve(
        docs.map(doc => {
          if (doc.incompatibilities) {
            if (doc.incompatibilities.length === 1) {
              // Sync expects `incompatibilities` to be missing when there aren't
              // any so if we're about to delete the last one, we remove the
              // attribute altogether.
              delete doc.incompatibilities
            } else {
              const { incompatibilities } = doc
              const index = incompatibilities.findIndex(
                issue =>
                  issue.platform === 'win32' &&
                  issue.type === 'pathMaxBytes' &&
                  issue.pathBytes < 32766
              )
              incompatibilities.splice(index, 1)
            }
          }
          return doc
        })
      )
    }
  },
  {
    baseSchemaVersion: 12,
    targetSchemaVersion: 13,
    description: 'Merge trashed and deleted attributes into trashed',
    affectedDocs: (docs /*: SavedMetadata[] */) /*: SavedMetadata[] */ => {
      // $FlowFixMe `deleted` has been removed from Metadata thus this migration
      return docs.filter(doc => doc.deleted != null)
    },
    run: (docs /*: SavedMetadata[] */) /*: Promise<SavedMetadata[]> */ => {
      return Promise.resolve(
        docs.map(doc => {
          // $FlowFixMe `deleted` has been removed from Metadata
          if (doc.deleted) {
            doc.trashed = true
          }
          // $FlowFixMe `deleted` has been removed from Metadata
          delete doc.deleted
          return doc
        })
      )
    }
  }
] /*: Migration[] */)

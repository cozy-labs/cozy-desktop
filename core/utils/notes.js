/* @flow */

const fse = require('fs-extra')
const path = require('path')
const { default: CozyClient, models } = require('cozy-client')

const { NOTE_MIME_TYPE } = require('../remote/constants')

const logger = require('./logger')
const log = logger({
  component: 'Notes'
})

/*::
import { Config } from '../config'
import { Pouch } from '../pouch'
import { Remote } from '../remote'
import type { Metadata, MetadataRemoteInfo } from '../metadata'

type CozyNoteErrorCode = 'CozyDocumentMissingError' | 'UnreachableError'
*/

const isNote = (
  doc /*: { mime?: string, metadata?: Object } */
) /*: boolean %checks */ => {
  return (
    doc.mime === NOTE_MIME_TYPE &&
    doc.metadata != null &&
    doc.metadata.content != null &&
    doc.metadata.schema != null &&
    doc.metadata.title != null &&
    doc.metadata.version != null
  )
}

class CozyNoteError extends Error {
  /*::
  code: CozyNoteErrorCode
  cozyURL: string
  doc: { name: string }
  content: string
  */

  constructor(
    {
      code,
      cozyURL,
      doc,
      content
    } /*: { code: CozyNoteErrorCode, cozyURL: string, doc: { name: string }, content: string } */
  ) {
    super('Could not find document on remote Cozy')

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CozyNoteError)
    }

    this.name = 'CozyNoteError'
    this.code = code
    this.cozyURL = cozyURL
    this.doc = doc
    this.content = content
  }
}

const localDoc = async (
  filePath /*: string */,
  { config, pouch } /*: { config: Config, pouch: Pouch } */
) /*: Promise<Metadata> */ => {
  const relPath = path.relative(config.syncPath, filePath)
  const doc = await pouch.byLocalPath(relPath)
  if (!doc || doc.deleted) {
    throw new CozyNoteError({
      code: 'CozyDocumentMissingError',
      cozyURL: config.cozyUrl,
      doc: { name: path.basename(relPath) },
      content: '' // We'll add it later
    })
  }
  return doc
}

const remoteDoc = async (
  localDoc /*: Metadata */,
  { config, remote } /*: { config: Config, remote: Remote } */
) /*: Promise<MetadataRemoteInfo> */ => {
  try {
    return await remote.remoteCozy.find(localDoc.remote._id)
  } catch (err) {
    if (err.name === 'FetchError' && err.status === 404) {
      throw new CozyNoteError({
        code: 'CozyDocumentMissingError',
        cozyURL: config.cozyUrl,
        doc: { name: path.basename(localDoc.path) },
        content: '' // We'll add it later
      })
    }
    throw err
  }
}

const getCozyClient = async (
  { remote } /*: { remote: Remote } */
) /*: CozyClient */ => {
  await remote.remoteCozy.client.authorize()
  return await CozyClient.fromOldOAuthClient(remote.remoteCozy.client)
}

const findNote = async (
  filePath /*: string */,
  {
    config,
    pouch,
    remote
  } /*: { config: Config, pouch: Pouch, remote: Remote } */
) /*: Promise<{ noteUrl: string }> */ => {
  if (!(await fse.pathExists(filePath)))
    throw new Error('could not find local note file')

  try {
    const note = await localDoc(filePath, { config, pouch })
    log.info({ note }, 'note object')

    const client = await getCozyClient({ remote })
    if (!client) {
      throw new CozyNoteError({
        code: 'UnreachableError',
        cozyURL: config.cozyUrl,
        doc: { name: path.basename(filePath) },
        content: '' // We'll add it later
      })
    }

    const noteUrl = await models.note.fetchURL(client, { id: note.remote._id })
    log.info({ noteUrl }, 'computed url')
    return { noteUrl }
  } catch (err) {
    const filename = path.basename(filePath)
    const content = await fse.readFile(filePath, 'utf8')

    if (err.name === 'FetchError') {
      if (err.status === 403 || err.status === 404) {
        log.warn({ err, path: filePath }, 'could not find remote Note')
        throw new CozyNoteError({
          code: 'CozyDocumentMissingError',
          cozyURL: config.cozyUrl,
          doc: { name: filename },
          content
        })
      } else {
        log.warn({ err, path: filePath }, 'could not reach remote Cozy')
        throw new CozyNoteError({
          code: 'UnreachableError',
          cozyURL: config.cozyUrl,
          doc: { name: filename },
          content
        })
      }
    } else {
      log.error({ err, path: filePath, sentry: true }, 'could not open note')
      err.doc = { name: filename }
      err.content = content
      throw err
    }
  }
}

module.exports = {
  CozyNoteError,
  findNote,
  isNote,
  localDoc,
  remoteDoc
}

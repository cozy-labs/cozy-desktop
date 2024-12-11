/* @flow */

const path = require('path')

const fse = require('fs-extra')
const tar = require('tar')

const { default: CozyClient, models } = require('cozy-client')

const { logger } = require('./logger')
const { NOTE_MIME_TYPE } = require('../remote/constants')

const log = logger({
  component: 'Notes'
})

/*::
import { Config } from '../config'
import { Pouch } from '../pouch'
import { Remote } from '../remote'
import type { Metadata, MetadataRemoteInfo } from '../metadata'
import type { FullRemoteFile, RemoteDir } from '../remote/document'

type CozyNoteErrorCode = 'CozyDocumentMissingError' | 'UnreachableError'
*/

const isNote = (
  doc /*: MetadataRemoteInfo | { mime?: string, metadata?: Object } */
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
) /*: Promise<FullRemoteFile|RemoteDir> */ => {
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

const parseArchive = async archivePath => {
  return new Promise((resolve, reject) => {
    const markdown = []
    const parser = new tar.Parse({
      onentry: entry => {
        entry.on('data', data => markdown.push(data))
        entry.on('end', () => resolve(Buffer.concat(markdown).toString()))
      },
      onwarn: err => reject(err),
      filter: path => path === 'index.md'
    })

    fse.createReadStream(archivePath).pipe(parser)
  })
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
    log.info('note object', { note })

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
    log.info('computed url', { noteUrl })
    return { noteUrl }
  } catch (err) {
    const filename = path.basename(filePath)
    let content
    try {
      content = await parseArchive(filePath)
    } catch (parseErr) {
      log.warn('could not parse given Cozy Note archive', {
        err: parseErr,
        path: filePath
      })
      if (parseErr === 'TAR_ENTRY_INVALID' || parseErr === 'TAR_BAD_ARCHIVE') {
        content = await fse.readFile(filePath, 'utf8')
      } else {
        content = ''
      }
    }

    if (err.name === 'FetchError') {
      if (err.status === 403 || err.status === 404) {
        log.warn('could not find remote Note', { err, path: filePath })
        throw new CozyNoteError({
          code: 'CozyDocumentMissingError',
          cozyURL: config.cozyUrl,
          doc: { name: filename },
          content
        })
      } else {
        log.warn('could not reach remote Cozy', { err, path: filePath })
        throw new CozyNoteError({
          code: 'UnreachableError',
          cozyURL: config.cozyUrl,
          doc: { name: filename },
          content
        })
      }
    } else {
      log.error('could not open note', { err, path: filePath, sentry: true })
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

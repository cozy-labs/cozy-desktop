/* @flow */

import { Client as CozyClient } from 'cozy-client-js'
import path from 'path'
import { Readable } from 'stream'

import Config from '../config'
import { FILES_DOCTYPE, FILE_TYPE } from './constants'
import { jsonApiToRemoteDoc, specialId } from './document'
import { composeAsync } from '../utils/func'

import type { RemoteDoc, RemoteDeletion } from './document'

export function DirectoryNotFound (path: string, cozyURL: string) {
  this.name = 'DirectoryNotFound'
  this.message = `Directory ${path} was not found on Cozy ${cozyURL}`
  this.stack = (new Error()).stack
}

// A remote Cozy instance.
//
// This class wraps cozy-client-js to:
//
// - deal with parsing and errors
// - provide custom functions (that may eventually be merged into the lib)
//
export default class RemoteCozy {
  url: string
  client: CozyClient

  constructor (config: Config) {
    this.url = config.cozyUrl
    this.client = new CozyClient({
      cozyURL: this.url,
      oauth: {
        clientParams: config.client,
        storage: config
      }
    })

    // Aliases:
    this.createJob = this.client.jobs.create
    this.unregister = this.client.auth.unregisterClient
    this.diskUsage = this.client.settings.diskUsage
    this.createFile = composeAsync(this.client.files.create, this.toRemoteDoc)
    this.createDirectory = composeAsync(this.client.files.createDirectory, this.toRemoteDoc)
    this.updateFileById = composeAsync(this.client.files.updateById, this.toRemoteDoc)
    this.updateAttributesById = composeAsync(this.client.files.updateAttributesById, this.toRemoteDoc)
    this.trashById = this.client.files.trashById
  }

  createJob: (workerType: string, args: any) => Promise<*>

  unregister: () => Promise<void>

  diskUsage: () => Promise<*>

  createFile: (data: Readable,
               options: {name: string,
                         dirID?: ?string,
                         contentType?: ?string,
                         lastModifiedDate?: ?Date}) => Promise<RemoteDoc>

  createDirectory: ({name: string, dirID?: string}) => Promise<RemoteDoc>

  updateFileById: (id: string,
                   data: Readable,
                   options: {contentType?: ?string,
                             lastModifiedDate?: ?Date }) => Promise<RemoteDoc>

  updateAttributesById: (id: string,
                         attrs: Object,
                         options?: {ifMatch?: string}) => Promise<RemoteDoc>

  trashById: (id: string, options?: {ifMatch: string}) => Promise<RemoteDoc>

  async changes (since: string = '0'): Promise<{last_seq: string, docs: Array<RemoteDoc|RemoteDeletion>}> {
    const options = {since, include_docs: true}
    const {last_seq, results} = await this.client.data.changesFeed(FILES_DOCTYPE, options)
    let docs = results.filter(r => !specialId(r.id)).map(r => r.doc)

    for (const doc of docs) {
      if (doc.type === 'file') await this._setPath(doc)
    }

    return {last_seq, docs}
  }

  async find (id: string): Promise<RemoteDoc> {
    const doc = await this.client.files.statById(id)
    return this.toRemoteDoc(doc)
  }

  async findMaybe (id: string): Promise<?RemoteDoc> {
    try {
      return await this.find(id)
    } catch (err) {
      return null
    }
  }

  async findDirectoryByPath (path: string): Promise<RemoteDoc> {
    const index = await this.client.data.defineIndex(FILES_DOCTYPE, ['path'])
    const results = await this.client.data.query(index, {selector: {path}})

    if (results.length === 0) throw new DirectoryNotFound(path, this.url)

    // FIXME: cozy-client-js query results have no _type
    return {...results[0], _type: FILES_DOCTYPE}
  }

  async downloadBinary (id: string): Promise<Readable> {
    const resp = await this.client.files.downloadById(id)
    return resp.body
  }

  async toRemoteDoc (doc: any): Promise<RemoteDoc> {
    if (doc.attributes) doc = jsonApiToRemoteDoc(doc)
    if (doc.type === FILE_TYPE) await this._setPath(doc)
    return doc
  }

  // Retrieve the path of a remote file doc
  async _setPath (doc: any): Promise<void> {
    const parentDir = await this.find(doc.dir_id)
    doc.path = path.posix.join(parentDir.path, doc.name)
  }
}

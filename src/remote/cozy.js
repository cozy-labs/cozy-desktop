/* @flow */

import { Cozy as CozyClient } from 'cozy-client-js'
import fetch from 'node-fetch'
import path from 'path'

import { FILES_DOCTYPE, FILE_TYPE } from './constants'

import type { RemoteDoc } from './document'

import { FILES_DOCTYPE } from './constants'

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

  constructor (url: string) {
    this.url = url
    this.client = new CozyClient({cozyURL: url})
  }

  async changes (seq: number = 0) {
    const changesUrl = `${this.url}/data/${FILES_DOCTYPE}/_changes?since=${seq}`

    let resp = await fetch(changesUrl)
    let json = await resp.json()

    return json
  }

  async find (id: string): Promise<RemoteDoc> {
    let doc = await this.client.find(FILES_DOCTYPE, id)

    if (doc.type === FILE_TYPE) {
      const parentDir = await this.client.find(FILES_DOCTYPE, doc.dir_id)
      doc.path = path.join(parentDir.path, doc.name)
    }

    return doc
  }

  async findMaybe (id: string): Promise<?RemoteDoc> {
    try {
      return await this.find(id)
    } catch (err) {
      return null
    }
  }
}

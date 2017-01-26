/* @flow */

import { Cozy as CozyClient } from 'cozy-client-js'
import fetch from 'node-fetch'

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
    const changesUrl = `${this.url}/data/io.cozy.files/_changes?since=${seq}`

    let resp = await fetch(changesUrl)
    let json = await resp.json()

    return json
  }
}

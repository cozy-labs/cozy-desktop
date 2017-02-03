/* @flow */

// The files/dirs metadata, as stored in PouchDB
export type Metadata = {
  _id: string,
  // TODO: v3: Rename to md5sum to match remote
  checksum?: string,
  class?: string,
  creationDate: string,
  // TODO: v3: Use the same local *type fields as the remote ones
  docType: string,
  executable?: boolean,
  lastModification: string,
  mime?: string,
  path: string,
  remote: {
    _id: string,
    _rev: string
  },
  size?: string,
  tags: string[],
  sides: {
    remote: ?string,
    local: ?string
  }
}

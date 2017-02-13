/* @flow */

// The remote Cozy metadata, as returned by cozy-client-js
export type RemoteDoc = {
  _id: string,
  _rev: string,
  _type: string,
  class?: string,
  created_at: string,
  dir_id: string,
  executable?: boolean,
  md5sum?: string,
  mime?: string,
  name: string,
  path: string,
  size?: string,
  tags: string[],
  type: string,
  updated_at: string
}


/* @flow */
/* eslint-env mocha */

import should from 'should'

import * as conversion from '../../src/conversion'

import type { Metadata } from '../../src/metadata'
import type { RemoteDoc } from '../../src/remote/document'

describe('conversion', function () {
  describe('createMetadata', () => {
    it('removes the leading / in the remote path', () => {
      const remoteDoc: RemoteDoc = {
        _id: 'whatever',
        _rev: 'whatever',
        _type: 'io.cozy.files',
        created_at: 'whatever',
        dir_id: 'io.cozy.files.root-dir',
        name: 'whatever',
        path: '/whatever',
        tags: [],
        type: 'file',
        updated_at: 'whatever'
      }

      const metadata : Metadata = conversion.createMetadata(remoteDoc)

      should(metadata.path).equal('whatever')
    })
  })

  describe('extractDirAndName', () =>
    it('returns the remote path and name', function () {
      let [path, name] = conversion.extractDirAndName('foo')
      should(path).equal('/')
      should(name).equal('foo');
      [path, name] = conversion.extractDirAndName('foo/bar')
      should(path).equal('/foo')
      should(name).equal('bar');
      [path, name] = conversion.extractDirAndName('foo/bar/baz')
      should(path).equal('/foo/bar')
      should(name).equal('baz')
    })
  )
})

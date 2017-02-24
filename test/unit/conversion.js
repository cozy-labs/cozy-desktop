/* @flow */
/* eslint-env mocha */

import should from 'should'

import * as conversion from '../../src/conversion'
import { FILES_DOCTYPE } from '../../src/remote/constants'
import timestamp from '../../src/timestamp'

import type { Metadata } from '../../src/metadata'
import type { RemoteDoc } from '../../src/remote/document'

describe('conversion', function () {
  describe('createMetadata', () => {
    it('builds the metadata for a remote file', () => {
      let remoteDoc: RemoteDoc = {
        _id: '12',
        _rev: '34',
        _type: FILES_DOCTYPE,
        class: 'document',
        created_at: '2016-01-02T03:04:05Z',
        dir_id: '56',
        executable: false,
        md5sum: 'N7UdGUp1E+RbVvZSTy1R8g==',
        mime: 'test/html',
        name: 'bar',
        path: '/foo/bar',
        size: '78',
        tags: ['foo'],
        type: 'file',
        updated_at: timestamp.stringify(timestamp.build(2017, 9, 8, 7, 6, 5))
      }
      let metadata : Metadata = conversion.createMetadata(remoteDoc)

      should(metadata).deepEqual({
        checksum: 'N7UdGUp1E+RbVvZSTy1R8g==',
        class: 'document',
        creationDate: '2016-01-02T03:04:05Z',
        docType: 'file',
        lastModification: '2017-09-08T07:06:05Z',
        mime: 'test/html',
        path: 'foo/bar',
        remote: {
          _id: '12',
          _rev: '34'
        },
        size: 78,
        tags: ['foo']
      })

      remoteDoc.executable = true
      metadata = conversion.createMetadata(remoteDoc)
      should(metadata.executable).equal(true)
    })

    it('builds the metadata for a remote dir', () => {
      const remoteDoc: RemoteDoc = {
        _id: '12',
        _rev: '34',
        _type: FILES_DOCTYPE,
        created_at: timestamp.stringify(timestamp.build(2016, 1, 2, 3, 4, 5)),
        dir_id: '56',
        name: 'bar',
        path: '/foo/bar',
        tags: ['foo'],
        type: 'directory',
        updated_at: timestamp.stringify(timestamp.build(2017, 9, 8, 7, 6, 5))
      }

      const metadata = conversion.createMetadata(remoteDoc)

      should(metadata).deepEqual({
        creationDate: '2016-01-02T03:04:05Z',
        docType: 'folder',
        lastModification: '2017-09-08T07:06:05Z',
        path: 'foo/bar',
        remote: {
          _id: '12',
          _rev: '34'
        },
        tags: ['foo']
      })
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

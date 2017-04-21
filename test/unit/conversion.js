/* @flow */
/* eslint-env mocha */

import should from 'should'
import path from 'path'

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
        md5sum: 'N7UdGUp1E+RbVvZSTy1R8g==',
        class: 'document',
        docType: 'file',
        updated_at: '2017-09-08T07:06:05Z',
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
        dir_id: '56',
        name: 'bar',
        path: '/foo/bar',
        tags: ['foo'],
        type: 'directory',
        updated_at: timestamp.stringify(timestamp.build(2017, 9, 8, 7, 6, 5))
      }

      const metadata = conversion.createMetadata(remoteDoc)

      should(metadata).deepEqual({
        docType: 'folder',
        updated_at: '2017-09-08T07:06:05Z',
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
      let [dir, name] = conversion.extractDirAndName('foo')
      should(dir).equal('/')
      should(name).equal('foo');
      [dir, name] = conversion.extractDirAndName(path.normalize('foo/bar'))
      should(dir).equal('/foo')
      should(name).equal('bar');
      [dir, name] = conversion.extractDirAndName(path.normalize('foo/bar/baz'))
      should(dir).equal('/foo/bar')
      should(name).equal('baz')
    })
  )
})

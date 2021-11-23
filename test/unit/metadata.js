/* @flow */
/* eslint-env mocha */

const _ = require('lodash')
const fse = require('fs-extra')
const path = require('path')
const should = require('should')
const sinon = require('sinon')

const configHelpers = require('../support/helpers/config')
const pouchHelpers = require('../support/helpers/pouch')
const Builders = require('../support/builders')
const { onPlatform, onPlatforms } = require('../support/helpers/platform')

const metadata = require('../../core/metadata')
const {
  assignMaxDate,
  extractRevNumber,
  invalidChecksum,
  invalidPath,
  markSide,
  markAsUpToDate,
  detectIncompatibilities,
  sameBinary,
  sameFile,
  sameFolder,
  buildDir,
  buildFile,
  invariants,
  outOfDateSide,
  createConflictingDoc
} = metadata
const { Ignore } = require('../../core/ignore')
const stater = require('../../core/local/stater')
const { NOTE_MIME_TYPE } = require('../../core/remote/constants')
const pathUtils = require('../../core/utils/path')
const timestamp = require('../../core/utils/timestamp')

/*::
import type { Metadata, MetadataRemoteFile, MetadataRemoteDir } from '../../core/metadata'
import type { RemoteBase } from '../../core/remote/document'
*/

const { platform } = process

describe('metadata', function() {
  let builders

  before('instanciate config', configHelpers.createConfig)
  beforeEach('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach(function() {
    builders = new Builders({ pouch: this.pouch })
  })
  afterEach('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('.fromRemoteDoc()', () => {
    it('builds the metadata for a remote file', () => {
      const remoteDoc /*: MetadataRemoteFile */ = {
        _id: '12',
        _rev: '34',
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
        created_at: '2017-09-07T07:06:05Z',
        updated_at: '2017-09-08T07:06:05Z',
        cozyMetadata: {
          createdOn: 'alice.mycozy.cloud'
        }
      }
      const doc /*: Metadata */ = metadata.fromRemoteDoc(remoteDoc)

      should(doc).deepEqual({
        md5sum: 'N7UdGUp1E+RbVvZSTy1R8g==',
        class: 'document',
        docType: 'file',
        created_at: '2017-09-07T07:06:05.000Z',
        updated_at: '2017-09-08T07:06:05.000Z',
        mime: 'test/html',
        name: 'bar',
        path: pathUtils.remoteToLocal('foo/bar'),
        dir_id: '56',
        remote: {
          ...remoteDoc,
          created_at: timestamp.roundedRemoteDate(remoteDoc.created_at),
          updated_at: timestamp.roundedRemoteDate(remoteDoc.updated_at)
        },
        size: 78,
        tags: ['foo'],
        executable: false,
        cozyMetadata: {
          createdOn: 'alice.mycozy.cloud'
        }
      })

      remoteDoc.executable = true
      should(metadata.fromRemoteDoc(remoteDoc)).have.property(
        'executable',
        true
      )
    })

    it('builds the metadata for a remote dir', () => {
      const remoteDoc /*: MetadataRemoteDir */ = {
        _id: '12',
        _rev: '34',
        dir_id: '56',
        name: 'bar',
        path: '/foo/bar',
        tags: ['foo'],
        type: 'directory',
        created_at: '2017-09-07T07:06:05Z',
        updated_at: '2017-09-08T07:06:05Z'
      }

      const doc = metadata.fromRemoteDoc(remoteDoc)

      should(doc).deepEqual({
        docType: 'folder',
        created_at: '2017-09-07T07:06:05.000Z',
        updated_at: '2017-09-08T07:06:05.000Z',
        path: pathUtils.remoteToLocal('foo/bar'),
        name: 'bar',
        dir_id: '56',
        remote: {
          ...remoteDoc,
          created_at: timestamp.roundedRemoteDate(remoteDoc.created_at),
          updated_at: timestamp.roundedRemoteDate(remoteDoc.updated_at)
        },
        tags: ['foo']
      })
    })
  })

  describe('invalidPath', function() {
    should.Assertion.add('invalidPath', function() {
      this.params = {
        operator: 'to make metadata.invalidPath() return',
        expected: true
      }
      should(invalidPath(this.obj)).be.exactly(true)
    })

    it('returns true if the path is incorrect', function() {
      should({ path: path.sep }).have.invalidPath()
      should({ path: '/' }).have.invalidPath()
      should({ path: '' }).have.invalidPath()
      should({ path: '.' }).have.invalidPath()
      should({ path: '..' }).have.invalidPath()
      should({ path: '../foo/bar.png' }).have.invalidPath()
      should({ path: 'foo/..' }).have.invalidPath()
      should({ path: 'f/../oo/../../bar/./baz' }).have.invalidPath()
    })

    it('returns false if everything is OK', function() {
      should({ path: 'foo' }).not.have.invalidPath()
      should({ path: 'foo/bar' }).not.have.invalidPath()
      should({ path: 'foo/bar/baz.jpg' }).not.have.invalidPath()
    })

    it('returns false for paths with a leading slash', function() {
      should({ path: '/foo/bar' }).not.have.invalidPath()
      should({ path: '/foo/bar/baz.bmp' }).not.have.invalidPath()
    })
  })

  describe('invalidChecksum', function() {
    it('returns true if the checksum is missing for a file', function() {
      const missingMd5sum = builders.metafile().build()
      delete missingMd5sum.md5sum
      should(invalidChecksum(missingMd5sum)).be.true()
      should(
        invalidChecksum(
          builders
            .metafile()
            .md5sum(null)
            .build()
        )
      ).be.true()
      should(
        invalidChecksum(
          builders
            .metafile()
            .md5sum(undefined)
            .build()
        )
      ).be.true()
    })

    it('returns false if the checksum is missing for a folder', function() {
      should(invalidChecksum(builders.metadir().build())).be.false()
    })

    it('returns true if the checksum is incorrect', function() {
      should(
        invalidChecksum(
          builders
            .metafile()
            .md5sum('')
            .build()
        )
      ).be.true()
      should(
        invalidChecksum(
          builders
            .metafile()
            .md5sum('f00')
            .build()
        )
      ).be.true()
      const sha1 = '68b329da9893e34099c7d8ad5cb9c94068b329da'
      should(
        invalidChecksum(
          builders
            .metafile()
            .md5sum(sha1)
            .build()
        )
      ).be.true()
      const md5hex = 'adc83b19e793491b1c6ea0fd8b46cd9f'
      should(
        invalidChecksum(
          builders
            .metafile()
            .md5sum(md5hex)
            .build()
        )
      ).be.true()
      const md5base64truncated = 'rcg7GeeTSRscbqD9i0bNn'
      should(
        invalidChecksum(
          builders
            .metafile()
            .md5sum(md5base64truncated)
            .build()
        )
      ).be.true()
      const sha1base64 = 'aLMp2piT40CZx9itXLnJQGizKdo='
      should(
        invalidChecksum(
          builders
            .metafile()
            .md5sum(sha1base64)
            .build()
        )
      ).be.true()
      const md5base64NonPadded = 'rcg7GeeTSRscbqD9i0bNnw'
      should(
        invalidChecksum(
          builders
            .metafile()
            .md5sum(md5base64NonPadded)
            .build()
        )
      ).be.true()
    })

    it('returns false if the checksum is OK', function() {
      should(
        invalidChecksum(
          builders
            .metafile()
            .data('')
            .build()
        )
      ).be.false()
    })
  })

  describe('detectIncompatibilities', () => {
    const syncPath = ';'

    it('is null when all names in the path are compatible', function() {
      const doc = builders
        .metafile()
        .path('foo/bar')
        .build()
      should(detectIncompatibilities(doc, syncPath)).deepEqual([])
    })

    onPlatform('win32', () => {
      it('lists platform incompatibilities for all names in the path', function() {
        const doc = builders
          .metafile()
          .path('f?o:o\\ba|r\\baz\\q"ux')
          .build()
        should(detectIncompatibilities(doc, syncPath)).deepEqual([
          {
            type: 'reservedChars',
            name: 'q"ux',
            path: 'f?o:o\\ba|r\\baz\\q"ux',
            docType: 'file',
            reservedChars: new Set('"'),
            platform
          },
          {
            type: 'reservedChars',
            name: 'ba|r',
            path: 'f?o:o\\ba|r',
            docType: 'folder',
            reservedChars: new Set('|'),
            platform
          },
          {
            type: 'reservedChars',
            name: 'f?o:o',
            path: 'f?o:o',
            docType: 'folder',
            reservedChars: new Set('?:'),
            platform
          }
        ])
      })
    })

    onPlatforms(['darwin', 'linux'], () => {
      it('does not list Windows incompatibilities', () => {
        const doc = builders
          .metadir()
          .path('foo/b:ar/qux')
          .build()
        should(detectIncompatibilities(doc, syncPath)).deepEqual([])
      })
    })
  })

  describe('extractRevNumber', function() {
    it('extracts the revision number', function() {
      const infos = { _rev: '42-0123456789' }
      should(extractRevNumber(infos)).equal(42)
    })

    it('returns 0 if not found', function() {
      // $FlowFixMe the _rev attribute is missing on purpose
      should(extractRevNumber({})).equal(0)
    })
  })

  describe('isUpToDate', () => {
    it('is false when the given side is undefined in doc', function() {
      const doc = builders
        .metafile()
        .rev('1-0123456')
        .sides({ remote: 1 })
        .build()
      should(metadata.isUpToDate('local', doc)).be.false()
    })

    it('is true when the given side equals the target in doc', function() {
      const doc = builders
        .metafile()
        .rev('2-0123456')
        .sides({ remote: 1, local: 2 })
        .build()
      should(metadata.isUpToDate('local', doc)).be.true()
    })

    it('is false when the given side is lower than the target in doc', function() {
      const doc = builders
        .metafile()
        .rev('3-0123456')
        .sides({ remote: 3, local: 2 })
        .build()
      should(metadata.isUpToDate('local', doc)).be.false()
    })

    it('is true when the given side is the only one', function() {
      const doc = builders
        .metafile()
        .rev('3-0123456')
        .sides({ local: 2 })
        .build()
      should(metadata.isUpToDate('local', doc)).be.true()
    })

    // XXX: We implemented the same workaround as in `isAtLeastUpToDate()`
    // although we haven't encountered the same issue yet but it is possible.
    it('is true when the given side is the only one and lower than the target', function() {
      const doc = builders
        .metafile()
        .rev('3-0123456')
        .build()
      doc.sides = { local: 2, target: 35 }
      should(metadata.isUpToDate('local', doc)).be.true()
    })
  })

  describe('isAtLeastUpToDate', () => {
    it('is false when the given side is undefined in doc', function() {
      const doc = builders
        .metafile()
        .rev('1-0123456')
        .sides({ remote: 1 })
        .build()
      should(metadata.isAtLeastUpToDate('local', doc)).be.false()
    })

    it('is true when the given side equals the target in doc', function() {
      const doc = builders
        .metafile()
        .rev('2-0123456')
        .sides({ remote: 2, local: 2 })
        .build()
      should(metadata.isAtLeastUpToDate('local', doc)).be.true()
    })

    it('is true when the given side is greater than the target in doc', function() {
      const doc = builders
        .metafile()
        .rev('3-0123456')
        .sides({ remote: 3, local: 4 })
        .build()
      should(metadata.isAtLeastUpToDate('local', doc)).be.true()
    })

    it('is false when the given side is lower than the target in doc', function() {
      const doc = builders
        .metafile()
        .rev('3-0123456')
        .sides({ remote: 3, local: 2 })
        .build()
      should(metadata.isAtLeastUpToDate('local', doc)).be.false()
    })

    it('is true when the given side is the only one', function() {
      const doc = builders
        .metafile()
        .rev('3-0123456')
        .sides({ local: 2 })
        .build()
      should(metadata.isAtLeastUpToDate('local', doc)).be.true()
    })

    // XXX: It is yet unknown how we end up in this situation but it seems like
    // it can happen when we have sync errors and maybe some side dissociation.
    // Until we figure out the root cause, we try to prevent its consequences.
    it('is true when the given side is the only one and lower than the target', function() {
      const doc = builders
        .metafile()
        .rev('3-0123456')
        .build()
      doc.sides = { local: 2, target: 35 }
      should(metadata.isAtLeastUpToDate('local', doc)).be.true()
    })
  })

  describe('assignMaxDate', () => {
    it('assigns the previous timestamp to the doc when it is more recent than the current one to prevent updated_at < created_at errors on remote sync', function() {
      const was = builders.metafile().build()
      const doc = builders
        .metafile()
        .olderThan(was)
        .build()
      should(() => {
        assignMaxDate(doc, was)
      }).changeOnly(doc, {
        updated_at: was.updated_at
      })
    })

    it('does nothing when the doc has no previous version', function() {
      const doc = builders.metafile().build()
      should(() => {
        assignMaxDate(doc)
      }).not.change(doc)
    })

    it('does nothing when both current and previous timestamps are the same', function() {
      const was = builders.metafile().build()
      const doc = builders
        .metafile()
        .updatedAt(was.updated_at)
        .build()
      should(() => {
        assignMaxDate(doc, was)
      }).not.change(doc)
    })

    it('does nothing when the current timestamp is more recent than the previous one', function() {
      const was = builders.metafile().build()
      const doc = builders
        .metafile()
        .newerThan(was)
        .build()
      should(() => {
        assignMaxDate(doc, was)
      }).not.change(doc)
    })

    it('nevers changes the previous doc', function() {
      const was = builders.metafile().build()
      const sameDateDoc = builders
        .metafile()
        .updatedAt(was.updated_at)
        .build()
      const newerDoc = builders
        .metafile()
        .newerThan(was)
        .build()
      const olderDoc = builders
        .metafile()
        .olderThan(was)
        .build()
      should(() => {
        assignMaxDate(sameDateDoc, was)
      }).not.change(was)
      should(() => {
        assignMaxDate(newerDoc, was)
      }).not.change(was)
      should(() => {
        assignMaxDate(olderDoc, was)
      }).not.change(was)
    })
  })

  describe('sameFolder', () => {
    it('returns true if the folders are the same', function() {
      const a = builders
        .metadir()
        .ino(234)
        .path('foo/bar')
        .tags('qux')
        .updatedAt('2015-12-01T11:22:56.517Z')
        .remoteId('123')
        .remoteRev(4)
        .upToDate()
        .build()
      const b = builders
        .metadir()
        .ino(234)
        .path('FOO/BAR')
        .tags('qux')
        .updatedAt('2015-12-01T11:22:57.000Z')
        .remoteId('123')
        .remoteRev(4)
        .upToDate()
        .build()
      const c = builders
        .metadir()
        .path('FOO/BAR')
        .tags('qux', 'courge')
        .updatedAt('2015-12-01T11:22:57.000Z')
        .remoteId('123')
        .remoteRev(4)
        .upToDate()
        .build()
      const d = builders
        .metadir()
        .path('FOO/BAR')
        .tags('qux', 'courge')
        .updatedAt('2015-12-01T11:22:57.000Z')
        .remoteId('123')
        .remoteRev(8)
        .upToDate()
        .build()
      const e = builders
        .metadir()
        .path('FOO/BAZ')
        .tags('qux')
        .updatedAt('2015-12-01T11:22:57.000Z')
        .remoteId('123')
        .remoteRev(4)
        .upToDate()
        .build()
      const g = _.merge({}, a, { ino: a.ino + 2 })
      should(sameFolder(a, a)).be.true()
      should(sameFolder(a, b)).be.false()
      should(sameFolder(a, c)).be.false()
      should(sameFolder(a, d)).be.false()
      should(sameFolder(a, e)).be.false()
      should(sameFolder(a, g)).be.false()
      should(sameFolder(b, c)).be.false()
      should(sameFolder(b, d)).be.false()
      should(sameFolder(b, e)).be.false()
      should(sameFolder(c, d)).be.false()
      should(sameFolder(c, e)).be.false()
      should(sameFolder(d, e)).be.false()
      should(sameFolder(a, _.merge({ _deleted: true }, a))).be.true()
      should(
        sameFolder(
          b,
          _.merge({}, b, {
            _rev: 'whatever-other-rev',
            errors: 3,
            updated_at: '1900-01-01T11:22:56.517Z',
            overwrite: b,
            childMove: true,
            sides: { local: 123, remote: 124 },
            incompatibilities: [{ type: 'dirNameMaxBytes' }],
            moveFrom: a
          })
        )
      ).be.true()
    })

    it('does not fail when a property is absent on one side and undefined on the other', function() {
      const a = builders
        .metadir()
        .path('foo/bar')
        .ino(234)
        .tags('qux')
        .updatedAt('2015-12-01T11:22:56.517Z')
        .remoteId('123')
        .remoteRev(4)
        .upToDate()
        .build()

      _.each(['path', 'docType', 'remote', 'tags', 'ino'], property => {
        let b = _.clone(a)
        b[property] = undefined
        let c = _.clone(a)
        c[property] = null
        let d = _.clone(a)
        delete d[property]

        should(sameFolder(a, b)).be.false(
          `undefined ${property} is same as ${a[property]}`
        )
        should(sameFolder(a, c)).be.false(
          `null ${property} is same as ${a[property]}`
        )
        should(sameFolder(a, d)).be.false(
          `absent ${property} is same as ${a[property]}`
        )
        should(sameFolder(b, c)).be.true(
          `undefined ${property} is not same as null`
        )
        should(sameFolder(b, d)).be.true(
          `undefined ${property} is not as absent`
        )
        should(sameFolder(c, d)).be.true(
          `null ${property} is not same as absent`
        )
      })
    })
  })

  describe('sameFile', function() {
    it('returns true if the files are the same', function() {
      const a = builders
        .metafile()
        .path('foo/bar')
        .ino(1)
        .data('some data')
        .tags('qux')
        .updatedAt('2015-12-01T11:22:56.517Z')
        .remoteId('123')
        .remoteRev(4)
        .upToDate()
        .build()
      const b = builders
        .metafile()
        .path('FOO/BAR')
        .ino(1)
        .data('some data')
        .tags('qux')
        .updatedAt('2015-12-01T11:22:56.517Z')
        .remoteId('123')
        .remoteRev(4)
        .upToDate()
        .build()
      const c = builders
        .metafile()
        .path('FOO/BAR')
        .data('other data')
        .tags('qux')
        .updatedAt('2015-12-01T11:22:56.517Z')
        .remoteId('123')
        .remoteRev(4)
        .upToDate()
        .build()
      const d = builders
        .metafile()
        .path('FOO/BAR')
        .data('some data')
        .tags('qux')
        .updatedAt('2015-12-01T11:22:56.517Z')
        .remoteId('123')
        .remoteRev(8)
        .upToDate()
        .build()
      const e = builders
        .metafile()
        .path('FOO/BAZ')
        .data('some data')
        .tags('qux')
        .updatedAt('2015-12-01T11:22:56.517Z')
        .remoteId('123')
        .remoteRev(4)
        .upToDate()
        .build()
      const f = builders
        .metafile()
        .path('foo/bar')
        .data('some data')
        .size(12345)
        .tags('qux')
        .updatedAt('2015-12-01T11:22:56.517Z')
        .remoteId('123')
        .remoteRev(4)
        .upToDate()
        .build()
      const g = builders
        .metafile(a)
        .ino(a.ino + 1)
        .build()
      const h = builders
        .metafile(a)
        .remoteId('321')
        .build()
      should(sameFile(a, a)).be.true()
      should(sameFile(a, b)).be.false()
      should(sameFile(a, c)).be.false()
      should(sameFile(a, d)).be.false()
      should(sameFile(a, e)).be.false()
      should(sameFile(a, f)).be.false()
      should(sameFile(a, g)).be.false()
      should(sameFile(a, h)).be.false()
      should(sameFile(b, c)).be.false()
      should(sameFile(b, d)).be.false()
      should(sameFile(b, e)).be.false()
      should(sameFile(b, f)).be.false()
      should(sameFile(c, d)).be.false()
      should(sameFile(c, e)).be.false()
      should(sameFile(c, f)).be.false()
      should(sameFile(d, e)).be.false()
      should(sameFile(d, f)).be.false()
      should(sameFile(e, f)).be.false()
      should(sameFile(a, _.merge({ _deleted: true }, a))).be.true()
      should(
        sameFile(
          b,
          _.merge({}, b, {
            _rev: 'whatever-other-rev',
            class: 'other-class',
            errors: 3,
            updated_at: '1900-01-01T11:22:56.517Z',
            mime: 'other-class/other-type',
            overwrite: b,
            childMove: true,
            sides: { target: 124, local: 123, remote: 124 },
            incompatibilities: [{ type: 'nameMaxBytes' }],
            moveFrom: a
          })
        )
      ).be.true()
    })

    it('does not fail when a property is absent on one side and undefined on the other', function() {
      const a = builders
        .metafile()
        .path('foo/bar')
        .ino(23452)
        .data('some data')
        .executable(false)
        .tags('qux')
        .remoteId('123')
        .remoteRev(4)
        .upToDate()
        .build()

      _.each(
        ['path', 'docType', 'md5sum', 'remote', 'tags', 'size', 'ino'],
        property => {
          let b = _.clone(a)
          b[property] = undefined
          let c = _.clone(a)
          c[property] = null
          let d = _.clone(a)
          delete d[property]

          should(sameFile(a, b)).be.false(
            `undefined ${property} is same as ${a[property]}`
          )
          should(sameFile(a, c)).be.false(
            `null ${property} is same as ${a[property]}`
          )
          should(sameFile(a, d)).be.false(
            `absent ${property} is same as ${a[property]}`
          )
          should(sameFile(b, c)).be.true(
            `undefined ${property} is not same as null`
          )
          should(sameFile(b, d)).be.true(
            `undefined ${property} is not as absent`
          )
          should(sameFile(c, d)).be.true(
            `null ${property} is not same as absent`
          )
        }
      )
    })
  })

  describe('sameBinary', function() {
    it('returns true for two docs with the same checksum', function() {
      const one = builders
        .metafile()
        .md5sum('adc83b19e793491b1c6ea0fd8b46cd9f32e592fc')
        .build()
      const two = builders
        .metafile()
        .md5sum('adc83b19e793491b1c6ea0fd8b46cd9f32e592fc')
        .build()
      should(sameBinary(one, two)).be.true()
    })

    it('returns false for two docs with different checksums', function() {
      const one = builders
        .metafile()
        .md5sum('adc83b19e793491b1c6ea0fd8b46cd9f32e592fc')
        .build()
      const two = builders
        .metafile()
        .md5sum('2082e7f715f058acab2398d25d135cf5f4c0ce41')
        .build()
      should(sameBinary(one, two)).be.false()
    })
  })

  describe('markSide', function() {
    const path = 'path'

    for (const kind of ['File', 'Dir']) {
      let stats
      beforeEach(async function() {
        stats =
          kind === 'File'
            ? await stater.stat(__filename)
            : await stater.stat(__dirname)
      })

      it(`marks local: 1 for a new ${kind}`, async function() {
        const doc = metadata[`build${kind}`](path, stats)

        markSide('local', doc)
        should(doc).have.properties({ sides: { target: 1, local: 1 } })
      })

      it(`increments the side from the _rev of an already existing ${kind}`, async function() {
        const prev = metadata[`build${kind}`](path, stats)
        prev.sides = { target: 5, local: 3, remote: 5 }
        prev._rev = '5-0123'
        const doc = metadata[`build${kind}`](path, stats)

        markSide('local', doc, prev)
        should(doc).have.properties({
          sides: { target: 6, local: 6, remote: 5 }
        })
      })
    }
  })

  describe('incSides', () => {
    const sidesAfterInc = (doc /*: Metadata */) => {
      metadata.incSides(doc)
      return doc.sides
    }

    it('increments existing sides by 1 in-place', () => {
      should(sidesAfterInc({})).deepEqual(undefined)
      should(
        sidesAfterInc(
          builders
            .metadata()
            .sides({})
            .build()
        )
      ).deepEqual({ target: 0 })
      should(
        sidesAfterInc(
          builders
            .metadata()
            .sides({ local: 1 })
            .build()
        )
      ).deepEqual({ target: 2, local: 2 })
      should(
        sidesAfterInc(
          builders
            .metadata()
            .sides({ remote: 1 })
            .build()
        )
      ).deepEqual({ target: 2, remote: 2 })
      should(
        sidesAfterInc(
          builders
            .metadata()
            .sides({ local: 2, remote: 2 })
            .build()
        )
      ).deepEqual({ target: 3, local: 3, remote: 3 })
      should(
        sidesAfterInc(
          builders
            .metadata()
            .sides({ local: 3, remote: 2 })
            .build()
        )
      ).deepEqual({ target: 4, local: 4, remote: 3 })
    })
  })

  describe('detectSingleSide', () => {
    it('returns `local` if `remote` side is absent', () => {
      should(
        metadata.detectSingleSide(
          builders
            .metadata()
            .sides({ local: 1 })
            .build()
        )
      ).equal('local')
    })

    it('returns `remote` if `local` side is absent', () => {
      should(
        metadata.detectSingleSide(
          builders
            .metadata()
            .sides({ remote: 1 })
            .build()
        )
      ).equal('remote')
    })

    it('returns undefined if both sides are absent', () => {
      should(
        metadata.detectSingleSide(
          builders
            .metadata()
            .sides({})
            .build()
        )
      ).be.undefined()
    })

    it('returns undefined if `sides` is absent', () => {
      // $FlowFixMe sides is missing on purpose
      should(metadata.detectSingleSide({})).be.undefined()
    })
  })

  describe('buildFile', function() {
    it('creates a document for an existing file', async function() {
      const stats = await fse.stat(
        path.join(__dirname, '../fixtures/chat-mignon.jpg')
      )
      const md5sum = '+HBGS7uN4XdB0blqLv5tFQ=='
      const doc = buildFile('chat-mignon.jpg', stats, md5sum)
      should(doc).have.properties({
        path: 'chat-mignon.jpg',
        docType: 'file',
        md5sum,
        ino: stats.ino,
        size: 29865,
        mime: 'image/jpeg',
        tags: []
      })
      should(doc).have.property('updated_at')
      should(doc).have.property('executable', false)

      const remote = builders.remoteFile().build()
      should(
        buildFile('chat-mignon.jpg', stats, md5sum, remote).remote
      ).deepEqual(remote)
    })

    it('sets the correct MIME type for Cozy Notes', async function() {
      const stats = await fse.stat(
        path.join(__dirname, '../fixtures/chat-mignon.jpg')
      )
      const md5sum = '+HBGS7uN4XdB0blqLv5tFQ=='
      const doc = buildFile('chat-mignon.cozy-note', stats, md5sum)
      should(doc).have.properties({
        path: 'chat-mignon.cozy-note',
        docType: 'file',
        md5sum,
        ino: stats.ino,
        size: 29865,
        mime: NOTE_MIME_TYPE,
        tags: []
      })
      should(doc).have.property('updated_at')
      should(doc).have.property('executable', false)

      const remote = builders.remoteFile().build()
      should(
        buildFile('chat-mignon.jpg', stats, md5sum, remote).remote
      ).deepEqual(remote)
    })

    if (platform !== 'win32') {
      it('sets the executable bit', async function() {
        const filePath = path.join(__dirname, '../../tmp/test/executable')
        const whateverChecksum = '1B2M2Y8AsgTpgAmY7PhCfg=='
        await fse.ensureFile(filePath)
        await fse.chmod(filePath, '755')
        const stats = await fse.stat(filePath)
        const doc = buildFile('executable', stats, whateverChecksum)
        should(doc.executable).be.true()
      })
    }
  })

  describe('buildDir', () => {
    it('creates a document for an existing folder', async function() {
      const stats = await fse.stat(path.join(__dirname, '../fixtures'))
      const doc = buildDir('fixtures', stats)
      should(doc).have.properties({
        path: 'fixtures',
        docType: 'folder',
        ino: stats.ino,
        tags: []
      })
      should(doc).have.property('updated_at')

      const remote = builders.remoteDir().build()
      should(buildDir('fixtures', stats, remote).remote).deepEqual(remote)
    })

    it('sets #updated_at with mtime', () => {
      const path = 'whatever'
      const d1 = new Date('2018-01-18T16:46:18.362Z')
      const d2 = new Date('2018-02-18T16:46:18.362Z')
      const ino = 123

      should(
        buildDir(
          path,
          builders
            .stats()
            .ino(ino)
            .mtime(d1)
            .ctime(d1)
            .build()
        )
      ).have.property('updated_at', d1.toISOString())
      should(
        buildDir(
          path,
          builders
            .stats()
            .ino(ino)
            .mtime(d1)
            .ctime(d2)
            .build()
        )
      ).have.property('updated_at', d1.toISOString())
      should(
        buildDir(
          path,
          builders
            .stats()
            .ino(ino)
            .mtime(d2)
            .ctime(d1)
            .build()
        )
      ).have.property('updated_at', d2.toISOString())
    })

    it('accepts remote info', () => {
      const path = 'whatever'
      const ctime = new Date()
      const remote = builders.remoteDir().build()
      const doc = buildDir(
        path,
        builders
          .stats()
          .ctime(ctime)
          .mtime(ctime)
          .ino(123)
          .build(),
        remote
      )
      should(doc.remote).deepEqual(remote)
    })
  })

  describe('invariants', () => {
    let doc
    beforeEach(function() {
      doc = builders
        .metadata()
        .remoteId('badbeef')
        .upToDate()
        .build()
    })

    it('throws when trying to put bad doc (no sides)', () => {
      // $FlowFixMe sides is null on purpose
      should(() => invariants(Object.assign(doc, { sides: null }))).throw(
        /sides/
      )
    })

    it('throws when trying to put bad doc (no remote)', () => {
      // $FlowFixMe remote is null on purpose
      should(() => invariants(Object.assign(doc, { remote: null }))).throw(
        /sides\.remote/
      )
    })

    it('throws when trying to put bad doc (no md5sum)', function() {
      doc = builders
        .metafile()
        .remoteId('badbeef')
        .upToDate()
        .build()
      // $FlowFixMe md5sum is null on purpose
      should(() => invariants(Object.assign(doc, { md5sum: null }))).throw(
        /checksum/
      )
    })

    it('does not throw when trying to put bad doc when deleted and up-to-date', async () => {
      should(() =>
        invariants(
          Object.assign(doc, {
            _deleted: true,
            sides: { target: 0, local: 0, remote: 0 },
            // $FlowFixMe remote is null on purpose
            remote: null,
            // $FlowFixMe md5sum is null on purpose
            md5sum: null
          })
        )
      ).not.throw()
    })
  })

  describe('markAsUpToDate', () => {
    let doc
    beforeEach(async () => {
      doc = await builders
        .metadata()
        .notUpToDate()
        .remoteId('badbeef')
        .build()
    })

    it('increments the doc target', () => {
      const previousTarget = doc.sides.target

      markAsUpToDate(doc)

      should(doc.sides.target).eql(previousTarget + 1)
    })

    it('returns the new target', () => {
      const target = markAsUpToDate(doc)

      should(target)
        .be.a.Number()
        .and.eql(doc.sides.target)
    })

    it('sets both sides to the new target', () => {
      markAsUpToDate(doc)

      should(doc.sides.local)
        .eql(doc.sides.remote)
        .and.eql(doc.sides.target)
    })

    it('removes errors', () => {
      doc.errors = 1

      markAsUpToDate(doc)

      should(doc.errors).be.undefined()
    })
  })

  describe('outOfDateSide', () => {
    it('returns nothing if sides are not set', () => {
      const doc1 = builders
        .metadata()
        .sides({})
        .build()
      should(outOfDateSide(doc1)).be.undefined()
      const doc2 = builders
        .metadata()
        .sides()
        .build()
      should(outOfDateSide(doc2)).be.undefined()
    })

    it('returns nothing if sides are equal', () => {
      const doc = builders
        .metadata()
        .sides({ local: 1, remote: 1 })
        .build()
      should(outOfDateSide(doc)).be.undefined()
    })

    it('returns "local" if the local side is smaller than the remote one', () => {
      const doc = builders
        .metadata()
        .sides({ local: 1, remote: 2 })
        .build()
      should(outOfDateSide(doc)).equal('local')
    })

    it('returns "remote" if the remote side is smaller than the local one', () => {
      const doc = builders
        .metadata()
        .sides({ local: 2, remote: 1 })
        .build()
      should(outOfDateSide(doc)).equal('remote')
    })
  })

  describe('createConflictingDoc', function() {
    const filepath = 'parent/dir/file.txt'

    let doc
    beforeEach(function() {
      doc = builders
        .metafile()
        .path(filepath)
        .build()
    })

    it('returns a doc with a different path', () => {
      const newDoc = createConflictingDoc(doc)
      should(newDoc.path)
        .be.a.String()
        .and.not.equal(filepath)
    })

    it('does not change the other attributes', () => {
      const newDoc = createConflictingDoc(doc)
      should(_.omit(newDoc, ['path'])).deepEqual(_.omit(doc, ['path']))
    })
  })

  describe('shouldIgnore', () => {
    const ignore = new Ignore(['foo'])

    let isIgnored
    beforeEach(() => {
      isIgnored = sinon.spy(ignore, 'isIgnored')
    })

    afterEach(() => {
      isIgnored.restore()
    })

    it('calls isIgnored with the document normalized path', function() {
      metadata.shouldIgnore(
        builders
          .metadir()
          .path('échange/nourriture')
          .build(),
        ignore
      )
      metadata.shouldIgnore(
        builders
          .metafile()
          .path('échange/nourriture')
          .build(),
        ignore
      )

      should(isIgnored).have.been.calledTwice()
    })

    it('returns true when document is a folder', () => {
      const doc = builders
        .metadir()
        .path('échange/nourriture')
        .build()
      metadata.shouldIgnore(doc, ignore)

      should(isIgnored.calledOnce).be.true()
      should(isIgnored.args[0]).deepEqual([
        { relativePath: metadata.id(doc.path), isFolder: true }
      ])
    })

    it('returns false when document is a file', function() {
      const doc = builders
        .metafile()
        .path('échange/nourriture')
        .build()
      metadata.shouldIgnore(doc, ignore)

      should(isIgnored.args[0]).deepEqual([
        { relativePath: metadata.id(doc.path), isFolder: false }
      ])
    })
  })

  describe('newChildPath', () => {
    context(
      'when both the parent part and the parent path are normalized with NFC',
      () => {
        it('replaces the parent part with its new value', () => {
          const oldParentPath = 'énoncés'.normalize('NFC')
          const newParentPath = 'Énoncés'
          const childName = 'DS-1.pdf'
          const oldChildPath = path.join(oldParentPath, childName)

          should(
            metadata.newChildPath(oldChildPath, oldParentPath, newParentPath)
          ).equal(path.join(newParentPath, childName))
        })
      }
    )

    context(
      'when both the parent part and the parent path are normalized with NFD',
      () => {
        it('replaces the parent part with its new value', () => {
          const oldParentPath = 'énoncés'.normalize('NFD')
          const newParentPath = 'Énoncés'
          const childName = 'DS-1.pdf'
          const oldChildPath = path.join(oldParentPath, childName)

          should(
            metadata.newChildPath(oldChildPath, oldParentPath, newParentPath)
          ).equal(path.join(newParentPath, childName))
        })
      }
    )

    context(
      'when the parent part is normalized with NFC and the parent path with NFD',
      () => {
        it('replaces the parent part with its new value', () => {
          const oldParentPath = 'énoncés'.normalize('NFD')
          const newParentPath = 'Énoncés'
          const childName = 'DS-1.pdf'
          const oldChildPath = path.join(
            oldParentPath.normalize('NFC'),
            childName
          )

          should(
            metadata.newChildPath(oldChildPath, oldParentPath, newParentPath)
          ).equal(path.join(newParentPath, childName))
        })
      }
    )

    context(
      'when the parent part is normalized with NFD and the parent path with NFC',
      () => {
        it('replaces the parent part with its new value', () => {
          const oldParentPath = 'énoncés'.normalize('NFC')
          const newParentPath = 'Énoncés'
          const childName = 'DS-1.pdf'
          const oldChildPath = path.join(
            oldParentPath.normalize('NFD'),
            childName
          )

          should(
            metadata.newChildPath(oldChildPath, oldParentPath, newParentPath)
          ).equal(path.join(newParentPath, childName))
        })
      }
    )

    context('when the parent is moved', () => {
      it('replaces the parent part with its new value', () => {
        const oldParentPath = 'énoncés'.normalize('NFC')
        const newParentPath = 'Économie/Énoncés'
        const childName = 'DS-1.pdf'
        const oldChildPath = path.join(
          oldParentPath.normalize('NFD'),
          childName
        )

        should(
          metadata.newChildPath(oldChildPath, oldParentPath, newParentPath)
        ).equal(path.join(newParentPath, childName))
      })
    })

    context('when ancestors have different normalizations', () => {
      it('replaces the parent part with its new value', () => {
        const ancestorPath = 'énoncés'.normalize('NFC')
        const oldParentName = 'économie'.normalize('NFD')
        const oldParentPath = path.join(
          ancestorPath.normalize('NFD'),
          oldParentName
        )
        const newParentPath = oldParentPath.replace(oldParentName, 'Économie')
        const childName = 'DS-1.pdf'
        const oldChildPath = path.join(ancestorPath, oldParentName, childName)

        should(
          metadata.newChildPath(oldChildPath, oldParentPath, newParentPath)
        ).equal(path.join(newParentPath, childName))
      })

      context('when the parent is moved', () => {
        it('replaces the parent part with its new value', () => {
          const ancestorPath = 'énoncés'.normalize('NFC')
          const oldParentName = 'économie'.normalize('NFD')
          const oldParentPath = path.join(
            ancestorPath.normalize('NFD'),
            oldParentName
          )
          const newParentPath = path.join(ancestorPath, 'L1', 'Économie')
          const childName = 'DS-1.pdf'
          const oldChildPath = path.join(ancestorPath, oldParentName, childName)

          should(
            metadata.newChildPath(oldChildPath, oldParentPath, newParentPath)
          ).equal(path.join(newParentPath, childName))
        })
      })
    })
  })

  describe('updateLocal', () => {
    it('adds the local attribute if it is missing', function() {
      const doc = builders
        .metafile()
        .ino(1)
        .unmerged('local')
        .noLocal()
        .build()
      const expectedAttributes =
        process.platform === 'win32'
          ? metadata.LOCAL_ATTRIBUTES
          : _.without(metadata.LOCAL_ATTRIBUTES, 'fileid')

      metadata.updateLocal(doc)

      should(doc).have.property('local')
      should(doc.local).have.properties(expectedAttributes)
    })

    it('fetches the local attributes from the main doc', function() {
      const file1 = builders
        .metafile()
        .ino(1)
        .md5sum('checksum')
        .size(666)
        .type('georges/washington')
        .executable(true)
        .updatedAt('1989-11-14T03:30:23.293Z')
        .unmerged('local')
        .noLocal()
        .build()

      metadata.updateLocal(file1)

      should(file1.local).have.properties({
        docType: 'file',
        ino: 1,
        md5sum: 'checksum',
        size: 666,
        class: 'georges',
        mime: 'georges/washington',
        // XXX: files are never executable on Windows
        executable: process.platform === 'win32' ? false : true,
        updated_at: '1989-11-14T03:30:23.293Z'
      })

      const file2 = builders
        .metafile()
        .executable(false)
        .unmerged('local')
        .noLocal()
        .build()

      metadata.updateLocal(file2)

      should(file2.local)
        .have.property('executable')
        .be.false()

      const dir = builders
        .metadir()
        .ino(2)
        .updatedAt('2020-11-14T03:30:23.293Z')
        .unmerged('local')
        .noLocal()
        .build()

      metadata.updateLocal(dir)

      should(dir.local).have.properties({
        docType: 'folder',
        ino: 2,
        updated_at: '2020-11-14T03:30:23.293Z'
      })
      should(dir.local).not.have.properties([
        'md5sum',
        'size',
        'class',
        'mime',
        'executable'
      ])
    })

    it('prefers the provided local attributes', function() {
      const file = builders
        .metafile()
        .ino(1)
        .md5sum('checksum')
        .size(666)
        .type('georges/washington')
        .updatedAt('1989-11-14T03:30:23.293Z')
        .unmerged('local')
        .noLocal()
        .build()

      metadata.updateLocal(file, {
        ino: 2,
        md5sum: 'other',
        size: 333,
        mime: 'text/plain',
        executable: true,
        updated_at: '2020-11-14T03:30:23.293Z'
      })

      should(file.local).have.properties({
        docType: 'file',
        ino: 2,
        md5sum: 'other',
        size: 333,
        // XXX: we should maybe make sure mime and class are in sync
        class: 'georges',
        mime: 'text/plain',
        // XXX: files are never executable on Windows
        executable: process.platform === 'win32' ? false : true,
        updated_at: '2020-11-14T03:30:23.293Z'
      })
    })
  })

  describe('updateRemote', () => {
    it('adds the remote attribute if it is missing', function() {
      const remoteFile = builders.remoteFile().build()
      const doc = builders
        .metafile()
        .unmerged('remote')
        .noRemote()
        .build()

      metadata.updateRemote(doc, remoteFile)

      should(doc).have.property('remote')
      // XXX: Non exhaustive list of attributes
      should(doc.remote).have.properties([
        'type',
        '_id',
        '_rev',
        'path',
        'created_at',
        'updated_at',
        'cozyMetadata'
      ])
    })

    it('keeps non-overwritten remote attributes', function() {
      const file = builders
        .metafile()
        .path('parent/OLD')
        .md5sum('checksum')
        .size(666)
        .type('georges/washington')
        .executable(true)
        .updatedAt('1989-11-14T03:30:23.293Z')
        .unmerged('remote')
        .build()

      metadata.updateRemote(file, {
        path: '/parent/NEW'
      })

      should(file.remote).have.properties({
        type: file.remote.type,
        _id: file.remote._id,
        _rev: file.remote._rev,
        path: '/parent/NEW',
        created_at: file.remote.created_at,
        updated_at: file.remote.updated_at,
        cozyMetadata: file.remote.cozyMetadata
      })
    })
  })
})

/* eslint-env mocha */

const _ = require('lodash')
const fse = require('fs-extra')
const path = require('path')
const should = require('should')
const sinon = require('sinon')

const Builders = require('../support/builders')
const { onPlatform, onPlatforms } = require('../support/helpers/platform')

const metadata = require('../../core/metadata')
const {
  assignId,
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
  createConflictingDoc,
  CONFLICT_REGEXP
} = metadata
const { Ignore } = require('../../core/ignore')
const { FILES_DOCTYPE } = require('../../core/remote/constants')
const stater = require('../../core/local/stater')
const timestamp = require('../../core/utils/timestamp')

const { platform } = process

describe('metadata', function() {
  const builders = new Builders()

  describe('.fromRemoteDoc()', () => {
    it('builds the metadata for a remote file', () => {
      let remoteDoc /*: RemoteDoc */ = {
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
        updated_at: timestamp.stringify(timestamp.build(2017, 9, 8, 7, 6, 5)),
        cozyMetadata: {
          createdOn: 'alice.mycozy.cloud'
        },
        someUnusedProperty: 'unused value'
      }
      let doc /*: Metadata */ = metadata.fromRemoteDoc(remoteDoc)

      should(doc).deepEqual({
        md5sum: 'N7UdGUp1E+RbVvZSTy1R8g==',
        class: 'document',
        docType: 'file',
        updated_at: '2017-09-08T07:06:05Z',
        mime: 'test/html',
        name: 'bar',
        path: 'foo/bar',
        dir_id: '56',
        remote: {
          _id: '12',
          _rev: '34'
        },
        size: 78,
        tags: ['foo'],
        cozyMetadata: {
          createdOn: 'alice.mycozy.cloud'
        },
        someUnusedProperty: 'unused value'
      })

      remoteDoc.executable = true
      doc = metadata.fromRemoteDoc(remoteDoc)
      should(doc.executable).equal(true)
    })

    it('builds the metadata for a remote dir', () => {
      const remoteDoc /*: RemoteDoc */ = {
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

      const doc = metadata.fromRemoteDoc(remoteDoc)

      should(doc).deepEqual({
        docType: 'folder',
        updated_at: '2017-09-08T07:06:05Z',
        path: 'foo/bar',
        name: 'bar',
        dir_id: '56',
        remote: {
          _id: '12',
          _rev: '34'
        },
        tags: ['foo']
      })
    })
  })

  describe('assignId', function() {
    it('is available', function() {
      let doc = { path: 'FOO' }
      assignId(doc)
      doc._id.should.equal('FOO')
    })

    if (['linux', 'freebsd', 'sunos'].includes(platform)) {
      it('is case insensitive on UNIX', function() {
        let doc = { path: 'foo/bar/café' }
        assignId(doc)
        doc._id.should.equal('foo/bar/café')
      })
    }

    if (platform === 'darwin') {
      it('is case sensitive on OSX', function() {
        let doc = { path: 'foo/bar/café' }
        assignId(doc)
        doc._id.should.equal('FOO/BAR/CAFÉ')
      })
    }

    if (platform === 'win32') {
      it('is case sensitive on Windows', () => {
        let doc = { path: 'foo/bar/caf\u00E9' }
        assignId(doc)
        doc._id.should.equal('FOO/BAR/CAF\u00C9')
      })
    }
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
      let ret = invalidChecksum({ docType: 'file' })
      ret.should.be.true()
      ret = invalidChecksum({ docType: 'file', md5sum: null })
      ret.should.be.true()
      ret = invalidChecksum({ docType: 'file', md5sum: undefined })
      ret.should.be.true()
    })

    it('returns false if the checksum is missing for a folder', function() {
      should(invalidChecksum({ docType: 'folder' })).be.false()
    })

    it('returns true if the checksum is incorrect', function() {
      let ret = invalidChecksum({ md5sum: '' })
      ret.should.be.true()
      ret = invalidChecksum({ md5sum: 'f00' })
      ret.should.be.true()
      let sha1 = '68b329da9893e34099c7d8ad5cb9c94068b329da'
      ret = invalidChecksum({ md5sum: sha1 })
      ret.should.be.true()
      let md5hex = 'adc83b19e793491b1c6ea0fd8b46cd9f'
      ret = invalidChecksum({ md5sum: md5hex })
      ret.should.be.true()
      let md5base64truncated = 'rcg7GeeTSRscbqD9i0bNn'
      ret = invalidChecksum({ md5sum: md5base64truncated })
      ret.should.be.true()
      let sha1base64 = 'aLMp2piT40CZx9itXLnJQGizKdo='
      ret = invalidChecksum({ md5sum: sha1base64 })
      ret.should.be.true()
      let md5base64NonPadded = 'rcg7GeeTSRscbqD9i0bNnw'
      ret = invalidChecksum({ md5sum: md5base64NonPadded })
      ret.should.be.true()
    })

    it('returns false if the checksum is OK', function() {
      let doc = { md5sum: 'rcg7GeeTSRscbqD9i0bNnw==' }
      let ret = invalidChecksum(doc)
      ret.should.be.false()
    })
  })

  describe('detectIncompatibilities', () => {
    const syncPath = ';'

    it('is null when all names in the path are compatible', () => {
      const doc = { path: path.normalize('foo/bar'), docType: 'file' }
      should(detectIncompatibilities(doc, syncPath)).deepEqual([])
    })

    onPlatform('win32', () => {
      it('lists platform incompatibilities for all names in the path', () => {
        const path = 'f?o:o\\ba|r\\baz\\q"ux'
        const doc = { path, docType: 'file' }
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
        const path = 'foo/b:ar/qux'
        const doc = { path, docType: 'folder' }
        should(detectIncompatibilities(doc, syncPath)).deepEqual([])
      })
    })
  })

  describe('extractRevNumber', function() {
    it('extracts the revision number', function() {
      let infos = { _rev: '42-0123456789' }
      extractRevNumber(infos).should.equal(42)
    })

    it('returns 0 if not found', function() {
      extractRevNumber({}).should.equal(0)
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

    it('is true when the given side equals the short rev in doc', () => {
      const doc = builders
        .metafile()
        .rev('2-0123456')
        .sides({ remote: 1, local: 2 })
        .build()
      should(metadata.isUpToDate('local', doc)).be.true()
    })

    it('is false when the given side is lower than the short rev in doc', () => {
      const doc = builders
        .metafile()
        .rev('3-0123456')
        .sides({ remote: 3, local: 2 })
        .build()
      should(metadata.isUpToDate('local', doc)).be.false()
    })
  })

  describe('assignMaxDate', () => {
    it('assigns the previous timestamp to the doc when it is more recent than the current one to prevent updated_at < created_at errors on remote sync', () => {
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

    it('does nothing when the doc has no previous version', () => {
      const doc = builders.metafile().build()
      should(() => {
        assignMaxDate(doc)
      }).not.change(doc)
    })

    it('does nothing when both current and previous timestamps are the same', () => {
      const was = builders.metafile().build()
      const doc = builders
        .metafile()
        .updatedAt(was.updated_at)
        .build()
      should(() => {
        assignMaxDate(doc, was)
      }).not.change(doc)
    })

    it('does nothing when the current timestamp is more recent than the previous one', () => {
      const was = builders.metafile().build()
      const doc = builders
        .metafile()
        .newerThan(was)
        .build()
      should(() => {
        assignMaxDate(doc, was)
      }).not.change(doc)
    })

    it('nevers changes the previous doc', () => {
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
      let a = {
        _id: 'FOO/BAR',
        docType: 'folder',
        path: 'foo/bar',
        updated_at: '2015-12-01T11:22:56.517Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        },
        ino: 234
      }
      let b = {
        _id: 'FOO/BAR',
        docType: 'folder',
        path: 'FOO/BAR',
        updated_at: '2015-12-01T11:22:57.000Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        },
        ino: 234
      }
      let c = {
        _id: 'FOO/BAR',
        docType: 'folder',
        path: 'FOO/BAR',
        updated_at: '2015-12-01T11:22:57.000Z',
        tags: ['qux', 'courge'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      let d = {
        _id: 'FOO/BAR',
        docType: 'folder',
        path: 'FOO/BAR',
        updated_at: '2015-12-01T11:22:57.000Z',
        tags: ['qux', 'courge'],
        remote: {
          id: '123',
          rev: '8-901'
        }
      }
      let e = {
        _id: 'FOO/BAZ',
        docType: 'folder',
        path: 'FOO/BAZ',
        updated_at: '2015-12-01T11:22:57.000Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      const g = _.merge({}, a, { ino: a.ino + 2 })
      sameFolder(a, a).should.be.true()
      sameFolder(a, b).should.be.false()
      sameFolder(a, c).should.be.false()
      sameFolder(a, d).should.be.false()
      sameFolder(a, e).should.be.false()
      sameFolder(a, g).should.be.false()
      sameFolder(b, c).should.be.false()
      sameFolder(b, d).should.be.false()
      sameFolder(b, e).should.be.false()
      sameFolder(c, d).should.be.false()
      sameFolder(c, e).should.be.false()
      sameFolder(d, e).should.be.false()
      should(
        sameFolder(a, _.merge({ _deleted: true, moveTo: b._id }, a))
      ).be.true()
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
      let a = {
        _id: 'FOO/BAR',
        docType: 'folder',
        path: 'foo/bar',
        updated_at: '2015-12-01T11:22:56.517Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        },
        ino: 234,
        trashed: false
      }

      _.each(
        ['path', 'docType', 'remote', 'tags', 'trashed', 'ino'],
        property => {
          let b = _.clone(a)
          b[property] = undefined
          let c = _.clone(a)
          c[property] = null
          let d = _.clone(a)
          delete d[property]

          sameFolder(a, b).should.be.false(
            `undefined ${property} is same as ${a[property]}`
          )
          sameFolder(a, c).should.be.false(
            `null ${property} is same as ${a[property]}`
          )
          sameFolder(a, d).should.be.false(
            `absent ${property} is same as ${a[property]}`
          )
          sameFolder(b, c).should.be.true(
            `undefined ${property} is not same as null`
          )
          sameFolder(b, d).should.be.true(
            `undefined ${property} is not as absent`
          )
          sameFolder(c, d).should.be.true(
            `null ${property} is not same as absent`
          )
        }
      )
    })
  })

  describe('sameFile', function() {
    it('returns true if the files are the same', function() {
      let a = {
        _id: 'FOO/BAR',
        docType: 'file',
        path: 'foo/bar',
        md5sum: '9440ca447681546bd781d6a5166d18737223b3f6',
        updated_at: '2015-12-01T11:22:56.517Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        },
        ino: 1
      }
      let b = {
        _id: 'FOO/BAR',
        docType: 'file',
        path: 'FOO/BAR',
        md5sum: '9440ca447681546bd781d6a5166d18737223b3f6',
        updated_at: '2015-12-01T11:22:57.000Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        },
        ino: 1
      }
      let c = {
        _id: 'FOO/BAR',
        docType: 'file',
        path: 'FOO/BAR',
        md5sum: '000000047681546bd781d6a5166d18737223b3f6',
        updated_at: '2015-12-01T11:22:57.000Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      let d = {
        _id: 'FOO/BAR',
        docType: 'file',
        path: 'FOO/BAR',
        md5sum: '9440ca447681546bd781d6a5166d18737223b3f6',
        updated_at: '2015-12-01T11:22:57.000Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '8-901'
        }
      }
      let e = {
        _id: 'FOO/BAZ',
        docType: 'file',
        path: 'FOO/BAZ',
        md5sum: '9440ca447681546bd781d6a5166d18737223b3f6',
        updated_at: '2015-12-01T11:22:57.000Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      let f = {
        _id: 'FOO/BAR',
        docType: 'file',
        path: 'foo/bar',
        md5sum: '9440ca447681546bd781d6a5166d18737223b3f6',
        updated_at: '2015-12-01T11:22:56.517Z',
        size: 12345,
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      const g = _.merge({}, a, { ino: a.ino + 1 })
      const h = _.merge({}, a, {
        remote: _.merge({}, a.remote, { _id: '321' })
      })
      sameFile(a, a).should.be.true()
      sameFile(a, b).should.be.false()
      sameFile(a, c).should.be.false()
      sameFile(a, d).should.be.false()
      sameFile(a, e).should.be.false()
      sameFile(a, f).should.be.false()
      sameFile(a, g).should.be.false()
      sameFile(a, h).should.be.false()
      sameFile(b, c).should.be.false()
      sameFile(b, d).should.be.false()
      sameFile(b, e).should.be.false()
      sameFile(b, f).should.be.false()
      sameFile(c, d).should.be.false()
      sameFile(c, e).should.be.false()
      sameFile(c, f).should.be.false()
      sameFile(d, e).should.be.false()
      sameFile(d, f).should.be.false()
      sameFile(e, f).should.be.false()
      should(
        sameFile(a, _.merge({ _deleted: true, moveTo: b._id }, a))
      ).be.true()
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
            sides: { local: 123, remote: 124 },
            incompatibilities: [{ type: 'nameMaxBytes' }],
            moveFrom: a
          })
        )
      ).be.true()
    })

    it('does not fail when one file has executable: undefined', function() {
      let a = {
        _id: 'FOO/BAR',
        docType: 'file',
        path: 'foo/bar',
        md5sum: '9440ca447681546bd781d6a5166d18737223b3f6',
        updated_at: '2015-12-01T11:22:56.517Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      let b = _.clone(a)
      b.executable = undefined
      let c = _.clone(a)
      c.executable = false
      let d = _.clone(a)
      d.executable = true
      sameFile(a, b).should.be.true()
      sameFile(a, c).should.be.true()
      sameFile(a, d).should.be.false()
      sameFile(b, c).should.be.true()
      sameFile(b, d).should.be.false()
      sameFile(c, d).should.eql(process.platform === 'win32')
    })

    it('does not fail when a property is absent on one side and undefined on the other', function() {
      let a = {
        _id: 'FOO/BAR',
        docType: 'file',
        path: 'foo/bar',
        ino: 23452,
        md5sum: '9440ca447681546bd781d6a5166d18737223b3f6',
        size: 22,
        updated_at: '2015-12-01T11:22:56.517Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        },
        trashed: false,
        executable: false
      }

      _.each(
        [
          'path',
          'docType',
          'md5sum',
          'remote',
          'remote',
          'tags',
          'size',
          'trashed',
          'ino'
        ],
        property => {
          let b = _.clone(a)
          b[property] = undefined
          let c = _.clone(a)
          c[property] = null
          let d = _.clone(a)
          delete d[property]

          sameFile(a, b).should.be.false(
            `undefined ${property} is same as ${a[property]}`
          )
          sameFile(a, c).should.be.false(
            `null ${property} is same as ${a[property]}`
          )
          sameFile(a, d).should.be.false(
            `absent ${property} is same as ${a[property]}`
          )
          sameFile(b, c).should.be.true(
            `undefined ${property} is not same as null`
          )
          sameFile(b, d).should.be.true(
            `undefined ${property} is not as absent`
          )
          sameFile(c, d).should.be.true(
            `null ${property} is not same as absent`
          )
        }
      )
    })
  })

  describe('sameBinary', function() {
    it('returns true for two docs with the same checksum', function() {
      let one = {
        docType: 'file',
        md5sum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
      }
      let two = {
        docType: 'file',
        md5sum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
      }
      let ret = sameBinary(one, two)
      ret.should.be.true()
    })

    it('returns false for two different documents', function() {
      let one = {
        docType: 'file',
        md5sum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
      }
      let two = {
        docType: 'file',
        md5sum: '2082e7f715f058acab2398d25d135cf5f4c0ce41',
        remote: {
          _id: 'f00b4r'
        }
      }
      let ret = sameBinary(one, two)
      ret.should.be.false()
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
    const docAfterIncSides = doc => {
      metadata.incSides(doc)
      return doc
    }

    it('increments existing sides by 1 in-place', () => {
      should(docAfterIncSides({})).deepEqual({})
      should(docAfterIncSides({ sides: {} })).deepEqual({ sides: {} })
      should(docAfterIncSides({ sides: { target: 1, local: 1 } })).deepEqual({
        sides: { target: 2, local: 2 }
      })
      should(docAfterIncSides({ sides: { target: 1, remote: 1 } })).deepEqual({
        sides: { target: 2, remote: 2 }
      })
      should(
        docAfterIncSides({ sides: { target: 2, local: 2, remote: 2 } })
      ).deepEqual({
        sides: { target: 3, local: 3, remote: 3 }
      })
      should(
        docAfterIncSides({ sides: { target: 3, local: 3, remote: 2 } })
      ).deepEqual({
        sides: { target: 4, local: 4, remote: 3 }
      })
    })
  })

  describe('detectSingleSide', () => {
    it('returns `local` if `remote` side is absent', () => {
      should(metadata.detectSingleSide({ sides: { local: 1 } })).equal('local')
    })

    it('returns `remote` if `local` side is absent', () => {
      should(metadata.detectSingleSide({ sides: { remote: 1 } })).equal(
        'remote'
      )
    })

    it('returns undefined if both sides are absent', () => {
      should(metadata.detectSingleSide({ sides: {} })).be.undefined()
    })

    it('returns undefined if `sides` is absent', () => {
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
      doc.should.have.properties({
        path: 'chat-mignon.jpg',
        docType: 'file',
        md5sum,
        ino: stats.ino,
        size: 29865
      })
      doc.should.have.property('updated_at')
      should.not.exist(doc.executable)

      const remote = { _id: 'foo', _rev: '456' }
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
    it('sets the latest of ctime & mtime as #updated_at', () => {
      const path = 'whatever'
      const d1 = new Date('2018-01-18T16:46:18.362Z')
      const d2 = new Date('2018-02-18T16:46:18.362Z')
      const ino = 123
      should(buildDir(path, { mtime: d1, ctime: d1, ino })).have.property(
        'updated_at',
        timestamp.fromDate(d1).toISOString()
      )
      should(buildDir(path, { mtime: d1, ctime: d2, ino })).have.property(
        'updated_at',
        timestamp.fromDate(d2).toISOString()
      )
      should(buildDir(path, { mtime: d2, ctime: d1, ino })).have.property(
        'updated_at',
        timestamp.fromDate(d2).toISOString()
      )
    })

    it('accepts remote info', () => {
      const path = 'whatever'
      const ctime = new Date()
      const remote = { _id: 'foo', _rev: '456' }
      const doc = buildDir(path, { ctime, mtime: ctime, ino: 123 }, remote)
      should(doc.remote).deepEqual(remote)
    })
  })

  describe('invariants', () => {
    let doc
    beforeEach(async () => {
      const builders = new Builders({ pouch: this.pouch })
      doc = await builders
        .metadata()
        .upToDate()
        .remoteId('badbeef')
        .build()
    })

    it('throws when trying to put bad doc (no sides)', async () => {
      should(() => invariants(Object.assign(doc, { sides: null }))).throw(
        /sides/
      )
    })

    it('throws when trying to put bad doc (no remote)', async () => {
      should(() => invariants(Object.assign(doc, { remote: null }))).throw(
        /sides\.remote/
      )
    })

    it('throws when trying to put bad doc (no md5sum)', async () => {
      doc = await builders
        .metafile()
        .upToDate()
        .remoteId('badbeef')
        .build()
      should(() => invariants(Object.assign(doc, { md5sum: null }))).throw(
        /checksum/
      )
    })

    it('does not throw when trying to put bad doc when deleted and up-to-date', async () => {
      should(() =>
        invariants(
          Object.assign(doc, {
            _deleted: true,
            sides: { local: 0, remote: 0 },
            remote: null,
            md5sum: null
          })
        )
      ).not.throw()
    })
  })

  describe('markAsUpToDate', () => {
    let doc
    beforeEach(async () => {
      const builders = new Builders({ pouch: this.pouch })
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
    let builders
    beforeEach(() => {
      builders = new Builders()
    })

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

  describe('createConflictingDoc', () => {
    const runSharedExamples = ({
      base,
      ext = '',
      ancestors = '',
      conflict = ''
    }) => {
      const filepath = () => ancestors + base + conflict + ext
      const _id = () => metadata.id(filepath())
      const doc = { path: filepath(), _id: _id() }

      it('returns a doc with a conflict path', () => {
        const newDoc = createConflictingDoc(doc)
        should(newDoc.path)
          .be.a.String()
          .and.match(CONFLICT_REGEXP)
      })

      it('returns a doc within the same parent', () => {
        const newDoc = createConflictingDoc(doc)
        should(newDoc.path)
          .be.a.String()
          .and.startWith(ancestors)

        if (ancestors !== '')
          should(newDoc.path).not.containEql(ancestors + ancestors)
      })

      it('returns a doc with the same extension', () => {
        const newDoc = createConflictingDoc(doc)
        should(newDoc.path)
          .be.a.String()
          .and.endWith(ext)
      })

      it('returns a doc with a correct _id', () => {
        const newDoc = createConflictingDoc(doc)
        should(newDoc._id)
          .be.a.String()
          .and.equal(metadata.id(newDoc.path))
      })

      it('returns a doc with the first 180 characters of the base file name', () => {
        const newDoc = createConflictingDoc(doc)
        const conflictStart = path.basename(newDoc.path).search(CONFLICT_REGEXP)
        should(conflictStart).be.lessThanOrEqual(180)
        should(doc.path).startWith(newDoc.path.slice(0, conflictStart))
      })
    }

    context('with no file extension', () => {
      runSharedExamples({ base: 'docname' })
    })

    context('with complex extension `.tar.gz`', () => {
      it('should but does not keep complete extension', () => {
        // FIXME: must be docname-conflict-:ISODATE:.tar.gz instead of docname.tar-conflict-:ISODATE:.gz
        const doc = {
          path: 'docname.tar.gz'
        }
        const newDoc = createConflictingDoc(doc)
        should(path.extname(newDoc.path)).equal('.gz')
      })
    })

    context('with no previous conflicts', () => {
      runSharedExamples({ base: 'docname', ext: '.pdf' })
    })

    context('with previous file conflict', () => {
      runSharedExamples({
        base: 'docname',
        conflict: '-conflict-1970-01-01T13_37_00.666Z',
        ext: '.pdf'
      })

      context('with no file extension', () => {
        runSharedExamples({
          base: 'docname',
          conflict: '-conflict-1970-01-01T13_37_00.666Z'
        })
      })
    })

    context('with parents', () => {
      runSharedExamples({
        ancestors: path.normalize('parent/dir/'),
        base: 'docname',
        ext: '.pdf'
      })
    })

    context('with previous parent conflict', () => {
      const ancestors = path.normalize(
        'parent/dir-conflict-1970-01-01T13_37_00.666Z/'
      )
      const base = 'docname'
      const ext = '.pdf'

      runSharedExamples({ ancestors, base, ext })

      it('should not replace the conflict suffix of a parent', () => {
        const doc = {
          path: ancestors + base + ext
        }
        const newDoc = createConflictingDoc(doc)
        should(newDoc.path)
          .startWith(`${ancestors}${base}-conflict-`)
          .and.endWith(ext)
      })
    })

    context('with long file name', () => {
      runSharedExamples({
        base:
          'Lorem ipsum dolor sit amet consectetur adipiscing elit Nam a velit at dolor euismod tincidunt sit amet id ante Cras vehicula lectus purus In lobortis risus lectus vitae rhoncus quam porta nullam',
        ext: '.pdf'
      })
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

    it('calls isIgnored with the document _id and true when document is a folder', () => {
      const doc = { _id: 'food', docType: 'folder' }
      metadata.shouldIgnore(doc, ignore)

      should(isIgnored.calledOnce).be.true()
      should(isIgnored.args[0]).deepEqual([
        { relativePath: doc._id, isFolder: true }
      ])
    })

    it('calls isIgnored with the document _id and false when document is a file', () => {
      const doc = { _id: 'food', docType: 'file' }
      metadata.shouldIgnore(doc, ignore)

      should(isIgnored.calledOnce).be.true()
      should(isIgnored.args[0]).deepEqual([
        { relativePath: doc._id, isFolder: false }
      ])
    })
  })
})

/* eslint-env mocha */

import clone from 'lodash.clone'
import path from 'path'
import sinon from 'sinon'
import should from 'should'

import Merge from '../../src/merge'

import configHelpers from '../helpers/config'
import pouchHelpers from '../helpers/pouch'

describe('Merge Helpers', function () {
  before('instanciate config', configHelpers.createConfig)
  before('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('instanciate merge', function () {
    this.side = 'local'
    this.merge = new Merge(this.pouch)
  })
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('sameDate', () =>
    it('returns true if the date are nearly the same', function () {
      let a = '2015-12-01T11:22:56.517Z'
      let b = '2015-12-01T11:22:56.000Z'
      let c = '2015-12-01T11:22:57.000Z'
      let d = '2015-12-01T11:22:59.200Z'
      let e = '2015-12-01T11:22:52.200Z'
      this.merge.sameDate(a, b).should.be.true()
      this.merge.sameDate(a, c).should.be.true()
      this.merge.sameDate(a, d).should.be.true()
      this.merge.sameDate(a, e).should.be.false()
      this.merge.sameDate(b, c).should.be.true()
      this.merge.sameDate(b, d).should.be.false()
      this.merge.sameDate(b, e).should.be.false()
      this.merge.sameDate(c, d).should.be.true()
      this.merge.sameDate(c, e).should.be.false()
      this.merge.sameDate(d, e).should.be.false()
    })
  )

  describe('sameFolder', () =>
    it('returns true if the folders are the same', function () {
      let a = {
        _id: 'FOO/BAR',
        docType: 'folder',
        path: 'foo/bar',
        creationDate: '2015-12-01T11:22:56.517Z',
        lastModification: '2015-12-01T11:22:56.517Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      let b = {
        _id: 'FOO/BAR',
        docType: 'folder',
        path: 'FOO/BAR',
        creationDate: '2015-12-01T11:22:56.000Z',
        lastModification: '2015-12-01T11:22:57.000Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      let c = {
        _id: 'FOO/BAR',
        docType: 'folder',
        path: 'FOO/BAR',
        creationDate: '2015-12-01T11:22:56.000Z',
        lastModification: '2015-12-01T11:22:57.000Z',
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
        creationDate: '2015-12-01T11:22:56.000Z',
        lastModification: '2015-12-01T11:22:57.000Z',
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
        creationDate: '2015-12-01T11:22:56.000Z',
        lastModification: '2015-12-01T11:22:57.000Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      this.merge.sameFolder(a, b).should.be.true()
      this.merge.sameFolder(a, c).should.be.false()
      this.merge.sameFolder(a, d).should.be.false()
      this.merge.sameFolder(a, e).should.be.false()
      this.merge.sameFolder(b, c).should.be.false()
      this.merge.sameFolder(b, d).should.be.false()
      this.merge.sameFolder(b, e).should.be.false()
      this.merge.sameFolder(c, d).should.be.false()
      this.merge.sameFolder(c, e).should.be.false()
      this.merge.sameFolder(d, e).should.be.false()
    })
  )

  describe('sameFile', function () {
    it('returns true if the files are the same', function () {
      let a = {
        _id: 'FOO/BAR',
        docType: 'file',
        path: 'foo/bar',
        checksum: '9440ca447681546bd781d6a5166d18737223b3f6',
        creationDate: '2015-12-01T11:22:56.517Z',
        lastModification: '2015-12-01T11:22:56.517Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      let b = {
        _id: 'FOO/BAR',
        docType: 'file',
        path: 'FOO/BAR',
        checksum: '9440ca447681546bd781d6a5166d18737223b3f6',
        creationDate: '2015-12-01T11:22:56.000Z',
        lastModification: '2015-12-01T11:22:57.000Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      let c = {
        _id: 'FOO/BAR',
        docType: 'file',
        path: 'FOO/BAR',
        checksum: '000000047681546bd781d6a5166d18737223b3f6',
        creationDate: '2015-12-01T11:22:56.000Z',
        lastModification: '2015-12-01T11:22:57.000Z',
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
        checksum: '9440ca447681546bd781d6a5166d18737223b3f6',
        creationDate: '2015-12-01T11:22:56.000Z',
        lastModification: '2015-12-01T11:22:57.000Z',
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
        checksum: '9440ca447681546bd781d6a5166d18737223b3f6',
        creationDate: '2015-12-01T11:22:56.000Z',
        lastModification: '2015-12-01T11:22:57.000Z',
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
        checksum: '9440ca447681546bd781d6a5166d18737223b3f6',
        creationDate: '2015-12-01T11:22:56.517Z',
        lastModification: '2015-12-01T11:22:56.517Z',
        size: 12345,
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      this.merge.sameFile(a, b).should.be.true()
      this.merge.sameFile(a, c).should.be.false()
      this.merge.sameFile(a, d).should.be.false()
      this.merge.sameFile(a, e).should.be.false()
      this.merge.sameFile(a, f).should.be.false()
      this.merge.sameFile(b, c).should.be.false()
      this.merge.sameFile(b, d).should.be.false()
      this.merge.sameFile(b, e).should.be.false()
      this.merge.sameFile(b, f).should.be.false()
      this.merge.sameFile(c, d).should.be.false()
      this.merge.sameFile(c, e).should.be.false()
      this.merge.sameFile(c, f).should.be.false()
      this.merge.sameFile(d, e).should.be.false()
      this.merge.sameFile(d, f).should.be.false()
      this.merge.sameFile(e, f).should.be.false()
    })

    it('does not fail when one file has executable: undefined', function () {
      let a = {
        _id: 'FOO/BAR',
        docType: 'file',
        path: 'foo/bar',
        checksum: '9440ca447681546bd781d6a5166d18737223b3f6',
        creationDate: '2015-12-01T11:22:56.517Z',
        lastModification: '2015-12-01T11:22:56.517Z',
        tags: ['qux'],
        remote: {
          id: '123',
          rev: '4-567'
        }
      }
      let b = clone(a)
      b.executable = undefined
      let c = clone(a)
      c.executable = false
      let d = clone(a)
      d.executable = true
      this.merge.sameFile(a, b).should.be.true()
      this.merge.sameFile(a, c).should.be.true()
      this.merge.sameFile(a, d).should.be.false()
      this.merge.sameFile(b, c).should.be.true()
      this.merge.sameFile(b, d).should.be.false()
      this.merge.sameFile(c, d).should.be.false()
    })
  })

  describe('sameBinary', function () {
    it('returns true for two docs with the same checksum', function () {
      let one = {
        docType: 'file',
        checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
      }
      let two = {
        docType: 'file',
        checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
      }
      let ret = this.merge.sameBinary(one, two)
      ret.should.be.true()
    })

    it('returns true for two docs with the same remote file', function () {
      let one = {
        checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc',
        docType: 'file',
        remote: {
          _id: 'f00b4r'
        }
      }
      let two = {
        docType: 'file',
        remote: {
          _id: 'f00b4r'
        }
      }
      let ret = this.merge.sameBinary(one, two)
      ret.should.be.true()
      ret = this.merge.sameBinary(two, one)
      ret.should.be.true()
    })

    it('returns false for two different documents', function () {
      let one = {
        docType: 'file',
        checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
      }
      let two = {
        docType: 'file',
        checksum: '2082e7f715f058acab2398d25d135cf5f4c0ce41',
        remote: {
          _id: 'f00b4r'
        }
      }
      let three = {
        docType: 'file',
        remote: {
          _id: 'c00463'
        }
      }
      let ret = this.merge.sameBinary(one, two)
      ret.should.be.false()
      ret = this.merge.sameBinary(two, three)
      ret.should.be.false()
      ret = this.merge.sameBinary(three, one)
      ret.should.be.false()
    })
  })

  describe('ensureParentExist', function () {
    it('works when in the root folder', function (done) {
      return this.merge.ensureParentExist(this.side, {_id: 'foo'}, function (err) {
        should.not.exist(err)
        done()
      })
    })

    it('works if the parent directory is present', function (done) {
      let doc = {
        _id: 'exists',
        docType: 'folder'
      }
      let child = {
        _id: 'exists/child',
        docType: 'folder'
      }
      this.pouch.db.put(doc, err => {
        should.not.exist(err)
        return this.merge.ensureParentExist(this.side, child, function (err) {
          should.not.exist(err)
          done()
        })
      })
    })

    it('creates the parent directory if missing', function (done) {
      this.merge.putFolder = sinon.stub().yields(null, 'OK')
      let doc = {
        _id: 'MISSING/CHILD',
        path: 'missing/child'
      }
      return this.merge.ensureParentExist(this.side, doc, err => {
        should.not.exist(err)
        this.merge.putFolder.called.should.be.true()
        this.merge.putFolder.args[0][1].should.have.properties({
          _id: 'MISSING',
          path: 'missing',
          docType: 'folder'
        })
        done()
      })
    })

    it('creates the full tree if needed', function (done) {
      this.merge.putFolder = sinon.stub().yields(null, 'OK')
      let doc = {
        _id: 'a/b/c/d/e',
        path: 'a/b/c/d/e'
      }
      return this.merge.ensureParentExist(this.side, doc, err => {
        should.not.exist(err)
        let iterable = ['a', 'a/b', 'a/b/c', 'a/b/c/d']
        for (let i = 0; i < iterable.length; i++) {
          let id = iterable[i]
          this.merge.putFolder.called.should.be.true()
          this.merge.putFolder.args[i][1].should.have.properties({
            _id: id,
            path: id,
            docType: 'folder'
          })
        }
        done()
      })
    })
  })

  describe('markSide', function () {
    it('marks local: 1 for a new doc', function () {
      let doc = {}
      this.merge.markSide('local', doc)
      should.exist(doc.sides)
      should.exist(doc.sides.local)
      doc.sides.local.should.equal(1)
    })

    it('increments the rev for an already existing doc', function () {
      let doc = {
        sides: {
          local: 3,
          remote: 5
        }
      }
      let prev = {_rev: '5-0123'}
      this.merge.markSide('local', doc, prev)
      doc.sides.local.should.equal(6)
      doc.sides.remote.should.equal(5)
    })
  })

  describe('resolveConflictDoc', function () {
    it('appends -conflict- and the date to the path', function (done) {
      let doc = {path: 'foo/bar'}
      this.merge.local = {}
      let spy = this.merge.local.resolveConflict = sinon.stub().yields(null)
      return this.merge.resolveConflict(this.side, doc, function () {
        spy.called.should.be.true()
        let dst = spy.args[0][0]
        let parts = dst.path.split('-conflict-')
        parts[0].should.equal('foo/bar')
        parts = parts[1].split('T')
        parts[0].should.match(/^\d{4}-\d{2}-\d{2}$/)
        parts[1].should.match(/^\d{2}:\d{2}:\d{2}.\d{3}Z$/)
        let src = spy.args[0][1]
        src.path.should.equal(doc.path)
        done()
      })
    })

    it('preserves the extension', function (done) {
      let doc = {path: 'foo/bar.jpg'}
      this.merge.local = {}
      let spy = this.merge.local.resolveConflict = sinon.stub().yields(null)
      return this.merge.resolveConflict(this.side, doc, function () {
        spy.called.should.be.true()
        let dst = spy.args[0][0]
        path.extname(dst.path).should.equal('.jpg')
        done()
      })
    })
  })
})

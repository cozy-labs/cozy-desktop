/* eslint-env mocha */

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

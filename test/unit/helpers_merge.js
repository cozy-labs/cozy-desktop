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
    this.merge.putFolderAsync = sinon.stub()
    this.merge.local = {}
    this.merge.local.resolveConflictAsync = sinon.stub()
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
      this.merge.putFolderAsync.returnsPromise().resolves('OK')
      let doc = {
        _id: 'MISSING/CHILD',
        path: 'missing/child'
      }
      return this.merge.ensureParentExist(this.side, doc, err => {
        should.not.exist(err)
        this.merge.putFolderAsync.called.should.be.true()
        this.merge.putFolderAsync.args[0][1].should.have.properties({
          _id: 'MISSING',
          path: 'missing',
          docType: 'folder'
        })
        done()
      })
    })

    it('creates the full tree if needed', function (done) {
      this.merge.putFolderAsync.returnsPromise().resolves('OK')
      let doc = {
        _id: 'a/b/c/d/e',
        path: 'a/b/c/d/e'
      }
      return this.merge.ensureParentExist(this.side, doc, err => {
        should.not.exist(err)
        let iterable = ['a', 'a/b', 'a/b/c', 'a/b/c/d']
        for (let i = 0; i < iterable.length; i++) {
          let id = iterable[i]
          this.merge.putFolderAsync.called.should.be.true()
          this.merge.putFolderAsync.args[i][1].should.have.properties({
            _id: id,
            path: id,
            docType: 'folder'
          })
        }
        done()
      })
    })
  })

  describe('resolveConflictDoc', function () {
    it('appends -conflict- and the date to the path', function (done) {
      let doc = {path: 'foo/bar'}
      let spy = this.merge.local.resolveConflictAsync
      spy.returnsPromise().resolves()
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
      let spy = this.merge.local.resolveConflictAsync
      spy.returnsPromise().resolves()
      return this.merge.resolveConflict(this.side, doc, function () {
        spy.called.should.be.true()
        let dst = spy.args[0][0]
        path.extname(dst.path).should.equal('.jpg')
        done()
      })
    })
  })
})

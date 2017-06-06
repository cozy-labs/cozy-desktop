/* eslint-env mocha */

import async from 'async'
import jsv from 'jsverify'
import path from 'path'
import should from 'should'
import sinon from 'sinon'
import uniq from 'lodash.uniq'

import configHelpers from '../helpers/config'
import pouchHelpers from '../helpers/pouch'

describe('Pouch', function () {
  before('instanciate config', configHelpers.createConfig)
  before('instanciate pouch', pouchHelpers.createDatabase)
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  before('create folders and files', function (done) {
    return pouchHelpers.createParentFolder(this.pouch, () => {
      return async.eachSeries([1, 2, 3], (i, callback) => {
        return pouchHelpers.createFolder(this.pouch, i, () => {
          return pouchHelpers.createFile(this.pouch, i, callback)
        })
      }, done)
    })
  })

  describe('ODM', function () {
    describe('getAll', () =>
      it('returns all the documents matching the query', function (done) {
        let params = {
          key: 'my-folder',
          include_docs: true
        }
        return this.pouch.getAll('byPath', params, function (err, docs) {
          should.not.exist(err)
          docs.length.should.equal(6)
          for (let i = 1; i <= 3; i++) {
            docs[i - 1].should.have.properties({
              _id: path.join('my-folder', `file-${i}`),
              docType: 'file',
              tags: []})
            docs[i + 2].should.have.properties({
              _id: path.join('my-folder', `folder-${i}`),
              docType: 'folder',
              tags: []})
          }
          done()
        })
      })
    )

    describe('byChecksum', () =>
      it('gets all the files with this checksum', function (done) {
        let _id = path.join('my-folder', 'file-1')
        let checksum = '1111111111111111111111111111111111111111'
        return this.pouch.byChecksum(checksum, function (err, docs) {
          should.not.exist(err)
          docs.length.should.be.equal(1)
          docs[0]._id.should.equal(_id)
          docs[0].md5sum.should.equal(checksum)
          done()
        })
      })
    )

    describe('byPath', function () {
      it('gets all the files and folders in this path', function (done) {
        return this.pouch.byPath('my-folder', function (err, docs) {
          should.not.exist(err)
          docs.length.should.be.equal(6)
          for (let i = 1; i <= 3; i++) {
            docs[i - 1].should.have.properties({
              _id: path.join('my-folder', `file-${i}`),
              docType: 'file',
              tags: []})
            docs[i + 2].should.have.properties({
              _id: path.join('my-folder', `folder-${i}`),
              docType: 'folder',
              tags: []})
          }
          done()
        })
      })

      it('gets only files and folders in the first level', function (done) {
        return this.pouch.byPath('', function (err, docs) {
          should.not.exist(err)
          docs.length.should.be.equal(1)
          docs[0].should.have.properties({
            _id: 'my-folder',
            docType: 'folder',
            tags: []})
          done()
        })
      })

      it('rejects design documents', function (done) {
        return this.pouch.byPath('_design', function (err, docs) {
          should.not.exist(err)
          docs.length.should.be.equal(0)
          done()
        })
      })
    })

    describe('byRecurivePath', function () {
      it('gets the files and folders in this path recursively', function (done) {
        return this.pouch.byRecursivePath('my-folder', function (err, docs) {
          should.not.exist(err)
          docs.length.should.be.equal(6)
          for (let i = 1; i <= 3; i++) {
            docs[i - 1].should.have.properties({
              _id: path.join('my-folder', `file-${i}`),
              docType: 'file',
              tags: []})
            docs[i + 2].should.have.properties({
              _id: path.join('my-folder', `folder-${i}`),
              docType: 'folder',
              tags: []})
          }
          done()
        })
      })

      it('gets the files and folders from root', function (done) {
        return this.pouch.byRecursivePath('', function (err, docs) {
          should.not.exist(err)
          docs.length.should.be.equal(7)
          docs[0].should.have.properties({
            _id: 'my-folder',
            docType: 'folder',
            tags: []})
          for (let i = 1; i <= 3; i++) {
            docs[i].should.have.properties({
              _id: path.join('my-folder', `file-${i}`),
              docType: 'file',
              tags: []})
            docs[i + 3].should.have.properties({
              _id: path.join('my-folder', `folder-${i}`),
              docType: 'folder',
              tags: []})
          }
          done()
        })
      })
    })

    describe('byRemoteId', function () {
      it('gets all the file with this remote id', function (done) {
        let id = '12345678901'
        return this.pouch.byRemoteId(id, function (err, doc) {
          should.not.exist(err)
          doc.remote._id.should.equal(id)
          should.exist(doc._id)
          should.exist(doc.docType)
          done()
        })
      })

      it('returns a 404 error if no file matches', function (done) {
        let id = 'abcdef'
        return this.pouch.byRemoteId(id, function (err, doc) {
          should.exist(err)
          err.status.should.equal(404)
          done()
        })
      })
    })

    describe('byRemoteIdMaybe', function () {
      it('does the same as byRemoteId() when document exists', function (done) {
        let id = '12345678901'
        this.pouch.byRemoteIdMaybe(id, function (err, doc) {
          should.not.exist(err)
          doc.remote._id.should.equal(id)
          should.exist(doc._id)
          should.exist(doc.docType)
          done()
        })
      })

      it('returns null when document does not exist', function (done) {
        let id = 'abcdef'
        this.pouch.byRemoteIdMaybe(id, function (err, doc) {
          should.not.exist(err)
          should.equal(null, doc)
          done()
        })
      })

      it('returns any non-404 error', function (done) {
        const otherError = new Error('not a 404')
        sinon.stub(this.pouch, 'byRemoteId').yields(otherError)

        this.pouch.byRemoteIdMaybe('12345678901', function (err, doc) {
          should.equal(otherError, err)
          done()
        })
      })
    })
  })

  describe('Views', function () {
    describe('createDesignDoc', function () {
      let query = `\
function (doc) {
    if (doc.docType === 'file') {
        emit(doc._id);
    }
}\
`

      it('creates a new design doc', function (done) {
        return this.pouch.createDesignDoc('file', query, err => {
          should.not.exist(err)
          return this.pouch.getAll('file', function (err, docs) {
            should.not.exist(err)
            docs.length.should.equal(3)
            for (let i = 1; i <= 3; i++) {
              docs[i - 1].docType.should.equal('file')
            }
            done()
          })
        })
      })

      it('does not update the same design doc', function (done) {
        return this.pouch.createDesignDoc('file', query, err => {
          should.not.exist(err)
          return this.pouch.db.get('_design/file', (err, was) => {
            should.not.exist(err)
            return this.pouch.createDesignDoc('file', query, err => {
              should.not.exist(err)
              return this.pouch.db.get('_design/file', function (err, designDoc) {
                should.not.exist(err)
                designDoc._id.should.equal(was._id)
                designDoc._rev.should.equal(was._rev)
                done()
              })
            })
          })
        })
      })

      it('updates the design doc if the query change', function (done) {
        return this.pouch.createDesignDoc('file', query, err => {
          should.not.exist(err)
          return this.pouch.db.get('_design/file', (err, was) => {
            should.not.exist(err)
            let newQuery = query.replace('file', 'File')
            return this.pouch.createDesignDoc('file', newQuery, err => {
              should.not.exist(err)
              return this.pouch.db.get('_design/file', function (err, designDoc) {
                should.not.exist(err)
                designDoc._id.should.equal(was._id)
                designDoc._rev.should.not.equal(was._rev)
                designDoc.views.file.map.should.equal(newQuery)
                done()
              })
            })
          })
        })
      })
    })

    describe('addByPathView', () =>
      it('creates the path view', function (done) {
        return this.pouch.addByPathView(err => {
          should.not.exist(err)
          return this.pouch.db.get('_design/byPath', function (err, doc) {
            should.not.exist(err)
            should.exist(doc)
            done()
          })
        })
      })
    )

    describe('addByChecksumView', () =>
      it('creates the checksum view', function (done) {
        return this.pouch.addByChecksumView(err => {
          should.not.exist(err)
          return this.pouch.db.get('_design/byChecksum', function (err, doc) {
            should.not.exist(err)
            should.exist(doc)
            done()
          })
        })
      })
    )

    describe('addByRemoteIdView', () =>
      it('creates the remote id view', function (done) {
        return this.pouch.addByRemoteIdView(err => {
          should.not.exist(err)
          return this.pouch.db.get('_design/byRemoteId', function (err, doc) {
            should.not.exist(err)
            should.exist(doc)
            done()
          })
        })
      })
    )

    describe('removeDesignDoc', () =>
      it('removes given view', function (done) {
        let query = `\
function (doc) {
if (doc.docType === 'folder') {
  emit(doc._id);
}
}\
`
        return this.pouch.createDesignDoc('folder', query, err => {
          should.not.exist(err)
          return this.pouch.getAll('folder', (err, docs) => {
            should.not.exist(err)
            docs.length.should.be.above(1)
            return this.pouch.removeDesignDoc('folder', err => {
              should.not.exist(err)
              return this.pouch.getAll('folder', function (err, res) {
                should.exist(err)
                done()
              })
            })
          })
        })
      })
    )
  })

  describe('Helpers', function () {
    describe('getPreviousRev', () =>
      it('retrieves previous document informations', function (done) {
        let id = path.join('my-folder', 'folder-1')
        this.pouch.db.get(id, (err, doc) => {
          should.not.exist(err)
          doc.tags = ['yipee']
          return this.pouch.db.put(doc, (err, updated) => {
            should.not.exist(err)
            return this.pouch.db.remove(id, updated.rev, err => {
              should.not.exist(err)
              return this.pouch.getPreviousRev(id, 1, (err, doc) => {
                should.not.exist(err)
                doc._id.should.equal(id)
                doc.tags.should.not.equal(['yipee'])
                return this.pouch.getPreviousRev(id, 2, function (err, doc) {
                  should.not.exist(err)
                  doc._id.should.equal(id)
                  doc.tags.join(',').should.equal('yipee')
                  done()
                })
              })
            })
          })
        })
      })
    )
  })

  describe('Sequence numbers', function () {
    describe('getLocalSeq', () =>
      it('gets 0 when the local seq number is not initialized', function (done) {
        return this.pouch.getLocalSeq(function (err, seq) {
          should.not.exist(err)
          seq.should.equal(0)
          done()
        })
      })
    )

    describe('setLocalSeq', () =>
      it('saves the local sequence number', function (done) {
        return this.pouch.setLocalSeq(21, err => {
          should.not.exist(err)
          return this.pouch.getLocalSeq((err, seq) => {
            should.not.exist(err)
            seq.should.equal(21)
            return this.pouch.setLocalSeq(22, err => {
              should.not.exist(err)
              return this.pouch.getLocalSeq(function (err, seq) {
                should.not.exist(err)
                seq.should.equal(22)
                done()
              })
            })
          })
        })
      })
    )

    describe('getRemoteSeq', () =>
      it('gets 0 when the remote seq number is not initialized', function (done) {
        return this.pouch.getRemoteSeq(function (err, seq) {
          should.not.exist(err)
          seq.should.equal(0)
          done()
        })
      })
    )

    describe('setRemoteSeq', function () {
      it('saves the remote sequence number', function (done) {
        return this.pouch.setRemoteSeq(31, err => {
          should.not.exist(err)
          return this.pouch.getRemoteSeq((err, seq) => {
            should.not.exist(err)
            seq.should.equal(31)
            return this.pouch.setRemoteSeq(32, err => {
              should.not.exist(err)
              return this.pouch.getRemoteSeq(function (err, seq) {
                should.not.exist(err)
                seq.should.equal(32)
                done()
              })
            })
          })
        })
      })

      it('can be called multiple times in parallel', function (done) {
        return async.each(__range__(1, 100, true), this.pouch.setRemoteSeq, function (err) {
          should.not.exist(err)
          done()
        })
      })
    })
  })

  // Disable this test on travis because it can be really slow...
  if (process.env.CI) { return }
  describe('byRecursivePath (bis)', function () {
    this.timeout(60000)

    // jsverify only works with Promise for async stuff
    if (typeof Promise !== 'function') { return }

    it('gets the nested files and folders', function (done) {
      let base = 'byRecursivePath'
      let property = jsv.forall('nearray nestring', paths => {
        paths = uniq(paths.concat([base]))
        return new Promise((resolve, reject) => {
          return this.pouch.resetDatabase(function (err) {
            if (err) {
              return reject(err)
            } else {
              return resolve()
            }
          })
        }).then(() => {
          return Promise.all(paths.map(p => {
            let doc = {_id: path.join(base, p), docType: 'folder'}
            return this.pouch.db.put(doc)
          }))
        }).then(() => {
          return new Promise((resolve, reject) => {
            return this.pouch.byRecursivePath(base, function (err, docs) {
              if (err) {
                return reject(err)
              } else {
                return resolve(docs.length === paths.length)
              }
            })
          })
        })
      })
      jsv.assert(property, {tests: 10}).then(function (res) {
        if (res === true) { done() } else { return done(res) }
      })
    })
  })
})

function __range__ (left, right, inclusive) {
  let range = []
  let ascending = left < right
  let end = !inclusive ? right : ascending ? right + 1 : right - 1
  for (let i = left; ascending ? i < end : i > end; ascending ? i++ : i--) {
    range.push(i)
  }
  return range
}

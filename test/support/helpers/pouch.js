const path = require('path')

const { assignId } = require('../../../core/metadata')
const { Pouch } = require('../../../core/pouch')

module.exports = {
  createDatabase(done) {
    this.pouch = new Pouch(this.config)
    return this.pouch.addAllViews(done)
  },

  cleanDatabase(done) {
    this.pouch.db.destroy(() => {
      this.pouch = null
      done()
    })
  },

  createParentFolder(pouch, callback) {
    let doc = {
      path: 'my-folder',
      docType: 'folder',
      updated_at: new Date(),
      tags: [],
      remote: {
        _id: `XXX`,
        _rev: '1-abc'
      },
      sides: {
        local: 1,
        remote: 1
      }
    }
    assignId(doc)
    return pouch.db.put(doc).asCallback(callback)
  },

  createFolder(pouch, i, callback) {
    let doc = {
      path: path.join('my-folder', `folder-${i}`),
      docType: 'folder',
      updated_at: new Date(),
      tags: [],
      remote: {
        _id: `123456789${i}`
      },
      sides: {
        local: 1,
        remote: 1
      }
    }
    assignId(doc)
    return pouch.db.put(doc).asCallback(callback)
  },

  createFile(pouch, i, callback) {
    let doc = {
      path: path.join('my-folder', `file-${i}`),
      docType: 'file',
      md5sum: `111111111111111111111111111111111111111${i}`,
      updated_at: new Date(),
      tags: [],
      remote: {
        _id: `1234567890${i}`
      },
      sides: {
        local: 1,
        remote: 1
      }
    }
    assignId(doc)
    return pouch.db.put(doc).asCallback(callback)
  }
}

const { Pouch } = require('../../../core/pouch')

module.exports = {
  async createDatabase() {
    this.pouch = new Pouch(this.config)
    await this.pouch.addAllViews()
  },

  async cleanDatabase() {
    if (this.pouch && this.pouch.db) {
      await this.pouch.db.destroy()
    }
    this.pouch = null
  },

  createParentFolder(pouch) {
    let doc = {
      path: 'my-folder',
      docType: 'folder',
      updated_at: new Date().toISOString(),
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
    return pouch.put(doc)
  },

  createFolder(pouch, folderPath) {
    let doc = {
      path: folderPath,
      docType: 'folder',
      updated_at: new Date().toISOString(),
      tags: [],
      remote: {
        _id: `123456789-${folderPath}`
      },
      sides: {
        local: 1,
        remote: 1
      }
    }
    return pouch.put(doc)
  },

  createFile(pouch, filePath) {
    let doc = {
      path: filePath,
      docType: 'file',
      md5sum: `111111111111111111111111111111111111111${filePath}`,
      updated_at: new Date().toISOString(),
      tags: [],
      remote: {
        _id: `1234567890-${filePath}`
      },
      sides: {
        local: 1,
        remote: 1
      }
    }
    return pouch.put(doc)
  }
}

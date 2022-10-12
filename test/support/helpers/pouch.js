const { FOLDER } = require('../../../core/metadata')
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
    const updated_at = new Date().toISOString()
    const doc = {
      path: 'my-folder',
      docType: FOLDER,
      updated_at,
      tags: [],
      local: {
        path: 'my-folder',
        updated_at
      },
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
    const updated_at = new Date().toISOString()
    const doc = {
      path: folderPath,
      docType: FOLDER,
      updated_at,
      tags: [],
      local: {
        path: folderPath,
        updated_at
      },
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
    const updated_at = new Date().toISOString()
    const doc = {
      path: filePath,
      docType: 'file',
      md5sum: `111111111111111111111111111111111111111${filePath}`,
      updated_at,
      tags: [],
      local: {
        path: filePath,
        updated_at
      },
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

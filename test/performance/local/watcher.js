/* eslint-env mocha */
/* @flow */

const Promise = require('bluebird')
const fse = require('fs-extra')
const path = require('path')

const Watcher = require('../../../core/local/chokidar/watcher')

const configHelpers = require('../../support/helpers/config')
const pouchHelpers = require('../../support/helpers/pouch')
const Builders = require('../../support/builders')

class SpyPrep {
  /*::
  calls: *
  */

  constructor() {
    this.calls = []

    this.stub('addFileAsync')
    this.stub('moveFileAsync')
    this.stub('moveFolderAsync')
    this.stub('putFolderAsync')
    this.stub('trashFileAsync')
    this.stub('trashFolderAsync')
    this.stub('updateFileAsync')
  }

  stub(method /*: string */) {
    // $FlowFixMe
    this[method] = (side, doc, was) => {
      if (was != null) {
        this.calls.push({ method, dst: doc.path, src: was.path })
      } else {
        this.calls.push({ method, path: doc.path })
      }
      return Promise.resolve()
    }
  }
}

let abspath

const createDoc = async (builders, dir, relpath /*: string */, ino) => {
  if (dir) {
    await builders.metadir().path(relpath).ino(ino).upToDate().create()
  } else {
    await builders
      .metafile()
      .path(relpath)
      .data('')
      .type('text/plain')
      .executable(false)
      .ino(ino)
      .upToDate()
      .create()
  }
}

describe('LocalWatcher charge', () => {
  if (process.env.CI) {
    it('is unstable on CI')
    return
  }

  const N = 100 * 1000
  let watcher, prep, builders
  before('instanciate config', configHelpers.createConfig)
  before('instanciate pouch', pouchHelpers.createDatabase)
  before('prepare builders', function () {
    builders = new Builders({ pouch: this.pouch })
  })
  before('create outside dir', async function () {
    await fse.emptyDir(path.resolve(path.join(this.syncPath, '..', 'outside')))
  })
  before('instanciate local watcher', async function () {
    prep = new SpyPrep()
    const events = { emit: () => {} }
    // $FlowFixMe
    watcher = new Watcher(this.syncPath, prep, this.pouch, events)
  })

  before('cleanup test directory', async function () {
    await fse.emptyDir(this.syncPath)
  })

  before(function () {
    abspath = relpath =>
      path.join(this.syncPath, relpath.replace(/\//g, path.sep))
  })

  let events
  before('prepare FS', async function () {
    this.timeout(10 * 60 * 1000)
    const now = new Date()
    events = new Array(N)
    for (let i = 0; i < N; i++) {
      const type = (i % 2 ? 'add' : 'unlink') + (i % 3 ? 'Dir' : '')
      const p = (i % 5) + '/' + (i % 7) + '/' + (i % 11) + '/' + i
      const stats = { ino: i, mtime: now, ctime: now }
      if (i % 2) {
        // type.startsWith('add')
        if (i % 3) {
          await fse.ensureDir(abspath(p))
        } else {
          await fse.ensureDir(path.dirname(abspath(p)))
          await fse.writeFileSync(abspath(p))
        }
      } else {
        await createDoc(builders, i % 3, p, i)
      }
      // $FlowFixMe
      events[i] = { type, path: p, stats }
    }
  })

  after('destroy pouch', pouchHelpers.cleanDatabase)
  after('clean config', configHelpers.cleanConfig)

  describe(`with ${N} events`, function () {
    this.timeout(5 * 60 * 1000)
    it('takes less than 5min and does not crash', async function () {
      this.timeout(5 * 60 * 1000)
      await watcher.onFlush(events)
      // TODO: Make benchmark more realistic with real actions, e.g. big moves.
    })
  })
})

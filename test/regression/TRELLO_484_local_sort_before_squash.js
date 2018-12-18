/* eslint-env mocha */
/* @flow */

const fse = require('fs-extra')
const _ = require('lodash')
const should = require('should')
const sinon = require('sinon')

const { runActions, init } = require('../support/helpers/scenarios')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const { IntegrationTestHelpers } = require('../support/helpers/integration')
const pouchHelpers = require('../support/helpers/pouch')

let helpers

// Spies
let prepCalls

describe('TRELLO #484: Local sort before squash (https://trello.com/c/RcRmqymw)', function () {
  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)
  beforeEach('set up synced dir', async function () {
    await fse.emptyDir(this.syncPath)
  })

  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function () {
    helpers = new IntegrationTestHelpers(this.config, this.pouch, cozyHelpers.cozy)
    prepCalls = []

    for (let method of ['addFileAsync', 'putFolderAsync', 'updateFileAsync',
      'moveFileAsync', 'moveFolderAsync', 'deleteFolderAsync', 'trashFileAsync',
      'trashFolderAsync', 'restoreFileAsync', 'restoreFolderAsync']) {
      // $FlowFixMe
      const origMethod = helpers.prep[method]
      sinon.stub(helpers.prep, method).callsFake(async (...args) => {
        const call /*: Object */ = {method}
        if (method.startsWith('move') || method.startsWith('restore')) {
          call.dst = args[1].path
          call.src = args[2].path
        } else {
          call.path = args[1].path
        }
        prepCalls.push(call)

        // Call the actual method so we can make assertions on metadata & FS
        return origMethod.apply(helpers.prep, args)
      })
    }
  })

  it('is fixed', async function () {
    await init({init: [
      {ino: 0, path: 'Administratif/'},
      {ino: 1, path: 'eBooks/'},
      {ino: 2, path: 'eBooks/Learning JavaScript/'},
      {ino: 3, path: 'eBooks/Learning JavaScript/Learning JavaScript.epub'},
      {ino: 4, path: 'eBooks/Mastering Cassandra/'},
      {ino: 5, path: 'eBooks/Mastering Cassandra/9781782162681_CASSANDRA.pdf'},
      {ino: 6, path: 'eBooks/Mastering Node.js/'},
      {ino: 7, path: 'eBooks/Mastering Node.js/book.mobi'},
      {ino: 8, path: 'eBooks/Mastering Node.js/book.pdf'},
      {ino: 9, path: 'facture-boulanger.pdf'}
    ]}, this.pouch, helpers.local.syncDir.abspath, _.identity)
    await runActions({actions: [
      {type: 'mv', src: 'facture-boulanger.pdf', dst: 'Administratif/facture-boulanger.pdf'},
      {type: 'mv', src: 'eBooks', dst: 'Livres'},
      // XXX: File is deleted after flush but before analysis (race condition):
      {type: 'mv', src: 'Administratif/facture-boulanger.pdf', dst: 'Administratif/facture-boulanger2.pdf'}
    ]}, helpers.local.syncDir.abspath, _.identity)

    // $FlowFixMe
    await helpers.local.simulateEvents([
      {type: 'unlink', path: 'facture-boulanger.pdf'},
      {type: 'add', path: 'Administratif/facture-boulanger.pdf', stats: {ino: 9, size: 209045, mtime: new Date('2017-10-09T08:40:44.298Z'), ctime: new Date('2017-10-09T08:40:44.298Z')}},
      {type: 'unlinkDir', path: 'eBooks/Learning JavaScript'},
      {type: 'unlinkDir', path: 'eBooks/Mastering Cassandra'},
      {type: 'unlinkDir', path: 'eBooks/Mastering Node.js'},
      {type: 'unlinkDir', path: 'eBooks'},
      {type: 'addDir', path: 'Livres', stats: {ino: 1, size: 4096, mtime: new Date('2017-10-09T08:40:51.472Z'), ctime: new Date('2017-10-09T08:40:51.472Z')}},
      {type: 'addDir', path: 'Livres/Learning JavaScript', stats: {ino: 2, size: 4096, mtime: new Date('2017-10-09T08:40:51.478Z'), ctime: new Date('2017-10-09T08:40:51.478Z')}},
      {type: 'addDir', path: 'Livres/Mastering Cassandra', stats: {ino: 4, size: 4096, mtime: new Date('2017-10-09T08:40:51.479Z'), ctime: new Date('2017-10-09T08:40:51.479Z')}},
      {type: 'addDir', path: 'Livres/Mastering Node.js', stats: {ino: 6, size: 4096, mtime: new Date('2017-10-09T08:40:51.479Z'), ctime: new Date('2017-10-09T08:40:51.479Z')}},
      {type: 'unlink', path: 'eBooks/Learning JavaScript/Learning JavaScript.epub'},
      {type: 'unlink', path: 'eBooks/Mastering Cassandra/9781782162681_CASSANDRA.pdf'},
      {type: 'unlink', path: 'eBooks/Mastering Node.js/book.mobi'},
      {type: 'unlink', path: 'eBooks/Mastering Node.js/book.pdf'},
      {type: 'add', path: 'Livres/Mastering Node.js/book.mobi', stats: {ino: 7, size: 16760, mtime: new Date('2017-10-09T08:40:52.521Z'), ctime: new Date('2017-10-09T08:40:52.521Z')}},
      {type: 'add', path: 'Livres/Mastering Node.js/book.pdf', stats: {ino: 8, size: 286325, mtime: new Date('2017-10-09T08:40:52.521Z'), ctime: new Date('2017-10-09T08:40:52.521Z')}},
      {type: 'add', path: 'Livres/Learning JavaScript/Learning JavaScript.epub', stats: {ino: 3, size: 1699609, mtime: new Date('2017-10-09T08:40:52.521Z'), ctime: new Date('2017-10-09T08:40:52.521Z')}},
      {type: 'add', path: 'Livres/Mastering Cassandra/9781782162681_CASSANDRA.pdf', stats: {ino: 5, size: 3091364, mtime: new Date('2017-10-09T08:40:52.522Z'), ctime: new Date('2017-10-09T08:40:52.522Z')}}
    ])
    await helpers.syncAll()

    // $FlowFixMe
    await helpers.local.simulateEvents([
      // XXX: The remaining move events are flushed
      {type: 'unlink', path: 'Administratif/facture-boulanger.pdf'},
      {type: 'add', path: 'Administratif/facture-boulanger2.pdf', stats: {ino: 9, size: 209045, mtime: new Date('2017-10-09T08:40:44.298Z'), ctime: new Date('2017-10-09T08:40:44.298Z')}}
    ])
    await helpers.syncAll()

    should(prepCalls).deepEqual([
      // XXX: The folder move aggregated/squashed as usual except it is applied first
      {method: 'moveFolderAsync', src: 'eBooks', dst: 'Livres'},
      // XXX: Moves from successive batches are correctly aggregated
      {method: 'moveFileAsync', src: 'facture-boulanger.pdf', dst: 'Administratif/facture-boulanger2.pdf'}
    ])

    should(await helpers.remote.tree()).deepEqual([
      '.cozy_trash/',
      'Administratif/',
      'Administratif/facture-boulanger2.pdf',
      'Livres/',
      'Livres/Learning JavaScript/',
      'Livres/Learning JavaScript/Learning JavaScript.epub',
      'Livres/Mastering Cassandra/',
      'Livres/Mastering Cassandra/9781782162681_CASSANDRA.pdf',
      'Livres/Mastering Node.js/',
      'Livres/Mastering Node.js/book.mobi',
      'Livres/Mastering Node.js/book.pdf'
    ])
  })
})

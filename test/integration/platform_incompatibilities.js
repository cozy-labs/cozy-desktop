/* @flow */
/* eslint-env mocha */

const path = require('path')

const should = require('should')
const sinon = require('sinon')

const metadata = require('../../core/metadata')
const { DIR_TYPE } = require('../../core/remote/constants')
const { INCOMPATIBLE_DOC_CODE } = require('../../core/sync/errors')
const timestamp = require('../../core/utils/timestamp')
const TestHelpers = require('../support/helpers')
const configHelpers = require('../support/helpers/config')
const pouchHelpers = require('../support/helpers/pouch')

/*::
import type { RemoteDir } from '../../core/remote/document'
import type { MetadataRemoteInfo, MetadataRemoteDir } from '../../core/metadata'
*/

describe('Platform incompatibilities', () => {
  if (process.platform !== 'win32') {
    it.skip(`is not tested on ${process.platform}`, () => {})
    return
  }

  let builders, helpers

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)

  afterEach(() => helpers.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function() {
    helpers = TestHelpers.init(this)
    builders = helpers.remote.builders

    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()

    sinon
      .stub(helpers._sync, 'blockSyncFor')
      .callsFake(async ({ change, err }) => {
        helpers._sync.lifecycle.blockFor(err.code)
        await helpers._sync.skipChange(change, err)
        helpers._sync.lifecycle.unblockFor(err.code)
      })
  })
  afterEach(async function() {
    await helpers.stop()
  })

  const shouldHaveBlockedFor = dpath =>
    Array.isArray(dpath)
      ? dpath.forEach(dpath =>
          should(helpers._sync.blockSyncFor).have.been.calledWithMatch({
            change: { doc: { path: path.normalize(dpath) } },
            err: { code: INCOMPATIBLE_DOC_CODE }
          })
        )
      : should(helpers._sync.blockSyncFor).have.been.calledWithMatch({
          change: { doc: { path: path.normalize(dpath) } },
          err: { code: INCOMPATIBLE_DOC_CODE }
        })

  const shouldNotHaveBlocked = () =>
    should(helpers._sync.blockSyncFor).not.have.been.called()

  it('add incompatible dir and file', async () => {
    await builders
      .remoteDir()
      .name('di:r')
      .create()
    await builders
      .remoteFile()
      .name('fi:le')
      .create()
    await helpers.pullAndSyncAll()

    should(await helpers.local.tree()).be.empty()
    should(await helpers.incompatibleTree()).deepEqual(['di:r/', 'fi:le'])
    shouldHaveBlockedFor(['di:r', 'fi:le'])
  })

  it('add incompatible dir with two colons', async () => {
    await builders
      .remoteDir()
      .name('d:i:r')
      .create()
    await helpers.pullAndSyncAll()

    should(await helpers.local.tree()).be.empty()
    should(await helpers.incompatibleTree()).deepEqual(['d:i:r/'])
    shouldHaveBlockedFor('d:i:r')
  })

  it('add compatible dir with some incompatible content', async () => {
    await helpers.remote.createTree([
      'dir/',
      'dir/file',
      'dir/fi:le',
      'dir/sub:dir/',
      'dir/sub:dir/file',
      'dir/subdir/',
      'dir/subdir/file'
    ])
    await helpers.pullAndSyncAll()

    should(await helpers.local.tree()).deepEqual([
      'dir/',
      'dir/file',
      'dir/subdir/',
      'dir/subdir/file'
    ])
    should(await helpers.incompatibleTree()).deepEqual([
      'dir/fi:le',
      'dir/sub:dir/',
      'dir/sub:dir/file'
    ])
    shouldHaveBlockedFor(['dir/fi:le', 'dir/sub:dir', 'dir/sub:dir/file'])
  })

  it('rename incompatible -> incompatible', async () => {
    await helpers.remote.createTree(['d:ir/', 'f:ile'])
    await helpers.pullAndSyncAll()

    helpers._sync.blockSyncFor.resetHistory()
    await helpers.remote.updateAttributesByPath('/d:ir', { name: 'di:r' })
    await helpers.remote.updateAttributesByPath('/f:ile', { name: 'fi:le' })
    await helpers.pullAndSyncAll()

    should(await helpers.local.tree()).be.empty()
    should(await helpers.incompatibleTree()).deepEqual(['di:r/', 'fi:le'])
    shouldHaveBlockedFor(['di:r', 'fi:le'])
  })

  it('trash & restore incompatible', async () => {
    const { dirs, files } = await helpers.remote.createTree(['d:ir/', 'f:ile'])
    await helpers.pullAndSyncAll()

    helpers._sync.blockSyncFor.resetHistory()
    await helpers.remote.trashById(dirs['d:ir/']._id)
    await helpers.remote.trashById(files['f:ile']._id)
    await helpers.pullAndSyncAll()

    should(await helpers.local.tree()).be.empty()
    should(await helpers.metadataTree()).be.empty()
    should(await helpers.incompatibleTree()).be.empty()
    shouldNotHaveBlocked()

    helpers._sync.blockSyncFor.resetHistory()
    await helpers.remote.restoreById(dirs['d:ir/']._id)
    await helpers.remote.restoreById(files['f:ile']._id)
    await helpers.pullAndSyncAll()

    should(await helpers.local.tree()).be.empty()
    should(await helpers.incompatibleTree()).deepEqual(['d:ir/', 'f:ile'])
    shouldHaveBlockedFor(['d:ir', 'f:ile'])
  })

  it('destroy & recreate incompatible', async () => {
    const { dirs, files } = await helpers.remote.createTree(['d:ir/', 'f:ile'])
    await helpers.pullAndSyncAll()

    helpers._sync.blockSyncFor.resetHistory()
    await helpers.remote.trashById(dirs['d:ir/']._id)
    await helpers.remote.trashById(files['f:ile']._id)
    await helpers.remote.destroyById(dirs['d:ir/']._id)
    await helpers.remote.destroyById(files['f:ile']._id)
    await helpers.pullAndSyncAll()

    should(await helpers.local.tree()).be.empty()
    should(await helpers.incompatibleTree()).be.empty()
    shouldNotHaveBlocked()

    helpers._sync.blockSyncFor.resetHistory()
    await helpers.remote.createTree(['d:ir/', 'f:ile'])
    await helpers.pullAndSyncAll()
    should(await helpers.local.tree()).be.empty()
    should(await helpers.incompatibleTree()).deepEqual(['d:ir/', 'f:ile'])
    shouldHaveBlockedFor(['d:ir', 'f:ile'])
  })

  it('make compatible bottom-up', async () => {
    const { dirs, files } = await helpers.remote.createTree([
      'd:ir/',
      'd:ir/sub:dir/',
      'd:ir/sub:dir/f:ile',
      'd:ir/sub:dir/subsubdir/'
    ])
    await helpers.pullAndSyncAll()

    helpers._sync.blockSyncFor.resetHistory()
    await helpers.remote.updateAttributesById(files['d:ir/sub:dir/f:ile']._id, {
      name: 'file'
    })
    await helpers.pullAndSyncAll()
    should(await helpers.local.tree()).be.empty()
    should(await helpers.incompatibleTree()).deepEqual([
      'd:ir/',
      'd:ir/sub:dir/',
      'd:ir/sub:dir/file',
      'd:ir/sub:dir/subsubdir/'
    ])
    shouldHaveBlockedFor('d:ir/sub:dir/file')

    helpers._sync.blockSyncFor.resetHistory()
    await helpers.remote.updateAttributesById(dirs['d:ir/']._id, {
      name: 'dir'
    })
    await helpers.pullAndSyncAll()
    should(await helpers.local.tree()).deepEqual(['dir/'])
    should(await helpers.incompatibleTree()).deepEqual([
      'dir/sub:dir/',
      'dir/sub:dir/file',
      'dir/sub:dir/subsubdir/'
    ])
    shouldHaveBlockedFor([
      'dir/sub:dir',
      'dir/sub:dir/file',
      'dir/sub:dir/subsubdir'
    ])

    helpers._sync.blockSyncFor.resetHistory()
    await helpers.remote.updateAttributesById(dirs['d:ir/sub:dir/']._id, {
      name: 'subdir'
    })
    await helpers.pullAndSyncAll()
    should(await helpers.local.tree()).deepEqual([
      'dir/',
      'dir/subdir/',
      'dir/subdir/file',
      'dir/subdir/subsubdir/'
    ])
    should(await helpers.incompatibleTree()).be.empty()
    shouldNotHaveBlocked()
  })

  it('rename dir compatible -> incompatible', async () => {
    const { dirs } = await helpers.remote.createTree([
      'dir/',
      'dir/subdir/',
      'dir/subdir/file'
    ])
    await helpers.pullAndSyncAll()

    helpers._sync.blockSyncFor.resetHistory()
    await helpers.remote.updateAttributesById(dirs['dir/']._id, {
      name: 'dir:'
    })
    await helpers.pullAndSyncAll()
    should(await helpers.local.tree()).deepEqual([
      'dir/',
      'dir/subdir/',
      'dir/subdir/file'
    ])
    should(await helpers.incompatibleTree()).deepEqual([
      'dir:/',
      'dir:/subdir/',
      'dir:/subdir/file'
    ])
    shouldHaveBlockedFor(['dir:', 'dir:/subdir', 'dir:/subdir/file'])
  })

  it('rename dir compatible -> incompatible with already incompatible content', async () => {
    const { dirs } = await helpers.remote.createTree([
      'dir/',
      'dir/sub:dir/',
      'dir/sub:dir/file'
    ])
    await helpers.pullAndSyncAll()

    helpers._sync.blockSyncFor.resetHistory()
    await helpers.remote.updateAttributesById(dirs['dir/']._id, {
      name: 'dir:'
    })
    await helpers.pullAndSyncAll()
    should(await helpers.local.tree()).deepEqual(['dir/'])
    should(await helpers.incompatibleTree()).deepEqual([
      'dir:/',
      'dir:/sub:dir/',
      'dir:/sub:dir/file'
    ])
    shouldHaveBlockedFor(['dir:', 'dir:/sub:dir', 'dir:/sub:dir/file'])
  })

  it('rename file compatible -> incompatible', async () => {
    const { files } = await helpers.remote.createTree(['dir/', 'dir/file'])
    await helpers.pullAndSyncAll()

    helpers._sync.blockSyncFor.resetHistory()
    await helpers.remote.updateAttributesById(files['dir/file']._id, {
      name: 'fi:le'
    })
    await helpers.pullAndSyncAll()
    should(await helpers.local.tree()).deepEqual(['dir/', 'dir/file'])
    should(await helpers.incompatibleTree()).deepEqual(['dir/fi:le'])
    shouldHaveBlockedFor('dir/fi:le')
  })

  it('rename dir compatible -> compatible with incompatible content', async () => {
    const { dirs } = await helpers.remote.createTree([
      'dir/',
      'dir/fi:le',
      'dir/sub:dir/'
    ])
    await helpers.pullAndSyncAll()

    helpers._sync.blockSyncFor.resetHistory()
    await helpers.remote.updateAttributesById(dirs['dir/']._id, {
      name: 'dir2'
    })
    await helpers.pullAndSyncAll()
    should(await helpers.local.tree()).deepEqual(['dir2/'])
    should(await helpers.incompatibleTree()).deepEqual([
      'dir2/fi:le',
      'dir2/sub:dir/'
    ])
    shouldHaveBlockedFor(['dir2/fi:le', 'dir2/sub:dir'])
  })

  it('move local dir with incompatible metadata & remote content', async () => {
    const { dirs } = await helpers.remote.createTree([
      'dir/',
      'dir/sub:dir/',
      'dir/sub:dir/file'
    ])
    await helpers.pullAndSyncAll()

    // Simulate local move
    helpers._sync.blockSyncFor.resetHistory()
    const dir = await helpers.pouch.byRemoteId(dirs['dir/']._id)
    const dir2 = metadata.buildDir('dir2', {
      atime: new Date(),
      mtime: new Date(),
      ctime: new Date(),
      directory: true,
      symbolicLink: false,
      size: dir.size,
      fileid: dir.fileid,
      ino: dir.ino
    })
    await helpers.prep.moveFolderAsync('local', dir2, dir)
    await helpers.syncAll()

    should(await helpers.remote.tree()).deepEqual([
      '.cozy_trash/',
      'dir2/',
      'dir2/sub:dir/',
      'dir2/sub:dir/file'
    ])
    should(await helpers.incompatibleTree()).deepEqual([
      'dir2/sub:dir/',
      'dir2/sub:dir/file'
    ])
    shouldHaveBlockedFor(['dir2/sub:dir', 'dir2/sub:dir/file'])
  })

  it('move remote dir with incompatible metadata & remote content', async () => {
    const { dirs } = await helpers.remote.createTree([
      'dir/',
      'dir/sub:dir/',
      'dir/sub:dir/file'
    ])
    await helpers.pullAndSyncAll()

    // Simulate remote move
    helpers._sync.blockSyncFor.resetHistory()
    if (dirs['dir/'].type !== DIR_TYPE) {
      throw new Error('Unexpected remote file with dir/ path')
    }
    const remoteDoc = dirs['dir/']
    const dir = await helpers.pouch.byRemoteId(remoteDoc._id)
    const newRemoteDoc = await builders
      .remoteDir(remoteDoc)
      .name('dir2')
      .updatedAt(...timestamp.spread(new Date()))
      .create()
    const dir2 = builders
      .metadir()
      .fromRemote(newRemoteDoc)
      .build()
    await helpers.prep.moveFolderAsync('remote', dir2, dir)
    await helpers.syncAll()

    should(await helpers.local.tree()).deepEqual(['dir2/'])
    should(await helpers.incompatibleTree()).deepEqual([
      'dir2/sub:dir/',
      'dir2/sub:dir/file'
    ])
    shouldHaveBlockedFor(['dir2/sub:dir', 'dir2/sub:dir/file'])
  })

  it('rename dir compatible -> incompatible -> compatible with compatible content', async () => {
    const { dirs } = await helpers.remote.createTree(['dir/', 'dir/file'])
    await helpers.pullAndSyncAll()
    should(await helpers.local.tree()).deepEqual(['dir/', 'dir/file'])
    should(await helpers.incompatibleTree()).be.empty()

    helpers._sync.blockSyncFor.resetHistory()
    await helpers.remote.updateAttributesById(dirs['dir/']._id, {
      name: 'd:ir'
    })
    await helpers.pullAndSyncAll()
    should(await helpers.local.tree()).deepEqual(['dir/', 'dir/file'])
    should(await helpers.incompatibleTree()).deepEqual(['d:ir/', 'd:ir/file'])
    shouldHaveBlockedFor(['d:ir', 'd:ir/file'])

    helpers._sync.blockSyncFor.resetHistory()
    await helpers.remote.updateAttributesById(dirs['dir/']._id, {
      name: 'dir'
    })
    await helpers.pullAndSyncAll()
    should(await helpers.local.tree()).deepEqual(['dir/', 'dir/file'])
    should(await helpers.incompatibleTree()).be.empty()
    shouldNotHaveBlocked()
  })
})

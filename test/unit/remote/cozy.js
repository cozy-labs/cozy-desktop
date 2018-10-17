/* eslint-env mocha */
/* @flow weak */

const _ = require('lodash')
const path = require('path')
const should = require('should')
const sinon = require('sinon')

const {
  FILES_DOCTYPE,
  TRASH_DIR_ID,
  TRASH_DIR_NAME
} = require('../../../core/remote/constants')
const {
  DirectoryNotFound,
  FSCK_PATH,
  RemoteCozy
} = require('../../../core/remote/cozy')

const configHelpers = require('../../support/helpers/config')
const { COZY_URL, builders, deleteAll } = require('../../support/helpers/cozy')
const CozyStackDouble = require('../../support/doubles/cozy_stack')

const cozyStackDouble = new CozyStackDouble()

describe('RemoteCozy', function () {
  before(() => cozyStackDouble.start())
  beforeEach(deleteAll)
  before('instanciate config', configHelpers.createConfig)
  before('register OAuth client', configHelpers.registerClient)
  after('clean config directory', configHelpers.cleanConfig)
  after(() => cozyStackDouble.stop())
  afterEach(() => cozyStackDouble.clearStub())

  let remoteCozy

  beforeEach(function () {
    this.config.cozyUrl = COZY_URL
    remoteCozy = new RemoteCozy(this.config)
  })

  describe('changes', function () {
    it('resolves with changes since then given seq', async function () {
      const { last_seq } = await remoteCozy.changes()

      const dir = await builders.remote.dir().create()
      const file = await builders.remote.file().inDir(dir).create()

      const { docs } = await remoteCozy.changes(last_seq)
      const ids = docs.map(doc => doc._id)

      should(ids.sort()).eql([file._id, dir._id].sort())
    })

    it('resolves with all changes since the db creation when no seq given', async function () {
      const dir = await builders.remote.dir().create()
      const file = await builders.remote.file().inDir(dir).create()

      const { docs } = await remoteCozy.changes()
      const ids = docs.map(doc => doc._id)

      should(ids).containEql(dir._id)
      should(ids).containEql(file._id)
      should(ids.length).be.greaterThan(2)
    })

    it('does not swallow errors', function () {
      this.config.cozyUrl = cozyStackDouble.url()
      const remoteCozy = new RemoteCozy(this.config)

      cozyStackDouble.stub((req, res) => {
        res.writeHead(500, {'Content-Type': 'text/plain'})
        res.end('whatever')
      })

      return should(remoteCozy.changes()).be.rejected()
    })
  })

  describe('find', function () {
    it('fetches a remote directory matching the given id', async function () {
      const remoteDir = await builders.remote.dir().create()

      const foundDir = await remoteCozy.find(remoteDir._id)

      foundDir.should.be.deepEqual(remoteDir)
    })

    it('fetches a remote root file including its path', async function () {
      const remoteFile = await builders.remote.file().inRootDir().name('foo').create()

      const foundFile = await remoteCozy.find(remoteFile._id)

      foundFile.should.deepEqual(_.defaults({path: '/foo'}, remoteFile))
    })

    it('fetches a remote non-root file including its path', async function () {
      const remoteDir = await builders.remote.dir().name('foo').inRootDir().create()
      const remoteFile = await builders.remote.file().name('bar').inDir(remoteDir).create()

      const foundFile = await remoteCozy.find(remoteFile._id)

      foundFile.should.deepEqual(_.defaults({path: '/foo/bar'}, remoteFile))
    })
  })

  describe('findMaybe', function () {
    it('does the same as find() when file or directory exists', async function () {
      const remoteDir = await builders.remote.dir().create()

      const foundDir = await remoteCozy.findMaybe(remoteDir._id)

      foundDir.should.deepEqual(remoteDir)
    })

    it('returns null when file or directory is not found', async function () {
      const found = await remoteCozy.findMaybe('missing')

      should.not.exist(found)
    })
  })

  describe('findDirectoryByPath', function () {
    it('resolves when the directory exists remotely', async function () {
      const dir = await builders.remote.dir().create()
      const subdir = await builders.remote.dir().inDir(dir).create()

      const foundDir = await remoteCozy.findDirectoryByPath(dir.path)
      delete foundDir.created_at
      foundDir.should.deepEqual(dir)

      const foundSubdir = await remoteCozy.findDirectoryByPath(subdir.path)
      delete foundSubdir.created_at
      foundSubdir.should.deepEqual(subdir)
    })

    it('rejects when the directory does not exist remotely', async function () {
      await builders.remote.file().name('existing').inRootDir().create()

      for (let path of ['/missing', '/existing/missing']) {
        await remoteCozy.findDirectoryByPath(path)
          .should.be.rejectedWith(DirectoryNotFound)
      }
    })

    it('rejects when the path matches a file', async function () {
      await builders.remote.file().name('foo').inRootDir().create()

      await remoteCozy.findDirectoryByPath('/foo')
        .should.be.rejectedWith(DirectoryNotFound)
    })
  })

  describe('findOrCreateDirectoryByPath', () => {
    it('resolves with the exisisting directory if any', async function () {
      const root = await remoteCozy.findDirectoryByPath('/')
      const dir = await builders.remote.dir().create()
      const subdir = await builders.remote.dir().inDir(dir).create()

      let result = await remoteCozy.findOrCreateDirectoryByPath(root.path)
      should(result).have.properties(root)
      result = await remoteCozy.findOrCreateDirectoryByPath(dir.path)
      should(result).have.properties(dir)
      result = await remoteCozy.findOrCreateDirectoryByPath(subdir.path)
      should(result).have.properties(subdir)
    })

    if (process.platform === 'win32' && process.env.CI) {
      it.skip('creates any missing parent directory (unstable on AppVeyor)', () => {})
    } else {
      it('creates any missing parent directory', async function () {
        const dir = await builders.remote.dir().name('dir').create()
        await builders.remote.dir().name('subdir').inDir(dir).create()

        let result = await remoteCozy.findOrCreateDirectoryByPath('/dir/subdir/foo')
        should(result).have.properties({
          type: 'directory',
          path: '/dir/subdir/foo'
        })
        result = await remoteCozy.findOrCreateDirectoryByPath('/dir/bar/baz')
        should(result).have.properties({
          type: 'directory',
          path: '/dir/bar/baz'
        })
        result = await remoteCozy.findOrCreateDirectoryByPath('/foo/bar/qux')
        should(result).have.properties({
          type: 'directory',
          path: '/foo/bar/qux'
        })
      })
    }

    it('does not swallow errors', async function () {
      this.config.cozyUrl = cozyStackDouble.url()
      const remoteCozy = new RemoteCozy(this.config)

      cozyStackDouble.stub((req, res) => {
        res.writeHead(500, {'Content-Type': 'text/plain'})
        res.end('Whatever')
      })

      await should(remoteCozy.findOrCreateDirectoryByPath('/whatever'))
        .be.rejected()
    })
  })

  describe('trashById', () => {
    it('resolves with a RemoteDoc representing the newly trashed item', async function () {
      const orig = await builders.remote.file()
        .timestamp(2017, 1, 1, 1, 1, 1)
        .create()

      const trashed = await remoteCozy.trashById(orig._id)

      should(trashed).have.properties({
        _id: orig._id,
        _type: FILES_DOCTYPE,
        class: orig.class,
        dir_id: TRASH_DIR_ID,
        executable: orig.executable,
        md5sum: orig.md5sum,
        mime: orig.mime,
        name: orig.name,
        path: path.posix.join('/', TRASH_DIR_NAME, orig.name),
        size: orig.size,
        tags: orig.tags,
        type: orig.type
      })
    })
  })

  describe('isEmpty', () => {
    it('is true when the folder with the given id is empty', async function () {
      const dir = await builders.remote.dir().create()
      should(await remoteCozy.isEmpty(dir._id)).be.true()

      const subdir = await builders.remote.dir().inDir(dir).create()
      should(await remoteCozy.isEmpty(dir._id)).be.false()
      should(await remoteCozy.isEmpty(subdir._id)).be.true()

      await builders.remote.file().inDir(dir).create()
      should(await remoteCozy.isEmpty(dir._id)).be.false()
      should(await remoteCozy.isEmpty(subdir._id)).be.true()

      await builders.remote.file().inDir(subdir).create()
      should(await remoteCozy.isEmpty(dir._id)).be.false()
      should(await remoteCozy.isEmpty(subdir._id)).be.false()
    })

    it('rejects when given a file id', async function () {
      const file = await builders.remote.file().create()
      await should(remoteCozy.isEmpty(file._id)).be.rejectedWith(/wrong type/)
    })

    it('rejects when no document matches the id', async function () {
      await should(remoteCozy.isEmpty('missing')).be.rejectedWith({status: 404})
    })
  })

  describe('downloadBinary', function () {
    it('resolves with a Readable stream of the file content', async function () {
      const remoteFile = await builders.remote.file().data('foo').create()

      const stream = await remoteCozy.downloadBinary(remoteFile._id)

      let data = ''
      stream.on('data', chunk => { data += chunk })
      stream.on('end', () => { data.should.equal('foo') })
    })
  })

  describe('#warnings()', () => {
    beforeEach(function () {
      this.config.cozyUrl = cozyStackDouble.url()
      remoteCozy = new RemoteCozy(this.config)
    })

    const stubWarningsResponse = (status /*: number */, data) => {
      cozyStackDouble.stub((req, res) => {
        if (req.url === '/status/') res.end('{}')
        else {
          res.writeHead(status)
          res.end(JSON.stringify(data))
        }
      })
    }

    it('is an array of warnings if any', async () => {
      // https://docs.cozy.io/en/cozy-stack/user-action-required/#response
      const warnings = [
        {
          status: '402',
          title: 'TOS Updated',
          code: 'tos-updated',
          detail: 'Terms of services have been updated',
          links: {
            self: 'https://manager.cozy.test/cozy/tos?domain=whatever.cozy.test'
          }
        }
      ]
      stubWarningsResponse(402, {errors: warnings})
      should(await remoteCozy.warnings()).deepEqual(warnings)
    })

    it('is an empty array on 404 (means either no warnings or API not available)', async () => {
      stubWarningsResponse(404)
      should(await remoteCozy.warnings()).deepEqual([])
    })

    it('assumes no warnings on unexpected 200 response', async () => {
      stubWarningsResponse(200, {whatever: 'whatever'})
      should(await remoteCozy.warnings()).deepEqual([])
    })

    for (let status of [401, 500]) {
      it(`does not swallow errors ${status}`, async () => {
        stubWarningsResponse(status)
        await should(remoteCozy.warnings()).be.rejectedWith({status})
      })
    }
  })

  describe('#fetchFileCorruptions()', () => {
    const stubFsck = () =>
      sinon.stub(remoteCozy.client, 'fetchJSON').withArgs('GET', FSCK_PATH)

    it('resolves with an empty array with an old stack without the /fsck route', async () => {
      stubFsck().rejects({status: 404})

      const contentMismatchFsckLog = await remoteCozy.fetchFileCorruptions()

      should(contentMismatchFsckLog).deepEqual([])
    })

    it('does not swallow other cozy-stack errors', async () => {
      const err = {status: 500, message: 'Other fsck error'}
      stubFsck().rejects(err)
      await should(remoteCozy.fetchFileCorruptions()).be.rejectedWith(err)
    })
  })
})

/* eslint-env mocha */
/* @flow weak */

const faker = require('faker')
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
  RemoteCozy,
  CozyClientRevokedError,
  handleCommonCozyErrors
} = require('../../../core/remote/cozy')

const configHelpers = require('../../support/helpers/config')
const { COZY_URL, cozy, deleteAll } = require('../../support/helpers/cozy')
const CozyStackDouble = require('../../support/doubles/cozy_stack')
const Builders = require('../../support/builders')

const cozyStackDouble = new CozyStackDouble()
const builders = new Builders({ cozy })

describe('core/remote/cozy', () => {
  describe('.handleCommonCozyErrors()', () => {
    let events, log

    beforeEach(() => {
      events = { emit: sinon.spy() }
      log = { error: sinon.spy(), warn: sinon.spy() }
    })

    const randomMessage = faker.random.words

    for (const fetchErrorSrc of ['cozy-client-js', 'electron-fetch']) {
      context(`with FetchError defined by ${fetchErrorSrc}`, () => {
        let FetchError
        if (fetchErrorSrc === 'cozy-client-js') {
          /* cozy-client-js defines its own FetchError type which is not exported.
           * This means we can't use the FetchError class from electron-fetch to
           * simulate network errors in cozy-client-js calls.
           */
          FetchError = function(message) {
            this.name = 'FetchError'
            this.response = {}
            this.url = faker.internet.url
            this.reason = message
            this.message = message
          }
        } else {
          FetchError = require('electron-fetch').FetchError
        }

        context('on FetchError status 400', () => {
          const err = new FetchError(randomMessage())
          err.status = 400

          it(`throws a CozyClientRevokedError to notify the GUI`, () => {
            should(() => {
              handleCommonCozyErrors({ err }, { events, log })
            }).throw(new CozyClientRevokedError())
          })
        })

        context('on FetchError status 402', () => {
          const status = 402
          const message = randomMessage()
          const err = new FetchError(
            JSON.stringify([{ status: status.toString(), message }])
          )
          err.status = status

          it('throws an error decorated with JSON parsed from the original message', () => {
            should(() => {
              handleCommonCozyErrors({ err }, { events, log })
            }).throw({ status, message })
          })
        })

        context('on FetchError status 403', () => {
          const err = new FetchError(randomMessage())
          err.status = 403

          it('throws a permissions error', () => {
            should(() => {
              handleCommonCozyErrors({ err }, { events, log })
            }).throw(/permissions/)
          })
        })

        context('on any other FetchError', () => {
          const err = new FetchError(randomMessage())

          it('emits "offline" to notify the GUI', () => {
            handleCommonCozyErrors({ err }, { events, log })
            should(events.emit).have.been.calledWith('offline')
          })

          it('returns "offline" to allow custom behavior', () => {
            should(handleCommonCozyErrors({ err }, { events, log })).eql(
              'offline'
            )
          })
        })

        context('on any other error', () => {
          const err = new Error(randomMessage())

          it('throws the error', () => {
            should(() => {
              handleCommonCozyErrors({ err }, { events, log })
            }).throw(err)
          })
        })
      })
    }
  })
})

describe('RemoteCozy', function() {
  before(() => cozyStackDouble.start())
  beforeEach(deleteAll)
  before('instanciate config', configHelpers.createConfig)
  before('register OAuth client', configHelpers.registerClient)
  after('clean config directory', configHelpers.cleanConfig)
  after(() => cozyStackDouble.stop())
  afterEach(() => cozyStackDouble.clearStub())

  let remoteCozy

  beforeEach(function() {
    this.config.cozyUrl = COZY_URL
    remoteCozy = new RemoteCozy(this.config)
  })

  describe('changes', function() {
    it('resolves with changes since then given seq', async function() {
      const { last_seq } = await remoteCozy.changes()

      const dir = await builders.remoteDir().create()
      const file = await builders
        .remoteFile()
        .inDir(dir)
        .create()

      const { docs } = await remoteCozy.changes(last_seq)
      const ids = docs.map(doc => doc._id)

      should(ids.sort()).eql([file._id, dir._id].sort())
    })

    it('resolves with all changes since the db creation when no seq given', async function() {
      const dir = await builders.remoteDir().create()
      const file = await builders
        .remoteFile()
        .inDir(dir)
        .create()

      const { docs } = await remoteCozy.changes()
      const ids = docs.map(doc => doc._id)

      should(ids).containEql(dir._id)
      should(ids).containEql(file._id)
      should(ids.length).be.greaterThan(2)
    })

    it('does not swallow errors', function() {
      this.config.cozyUrl = cozyStackDouble.url()
      const remoteCozy = new RemoteCozy(this.config)

      cozyStackDouble.stub((req, res) => {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('whatever')
      })

      return should(remoteCozy.changes()).be.rejected()
    })

    it('makes several calls to get changesfeed aka pagination', async () => {
      const fakeChangesFeed = sinon.stub(remoteCozy.client.data, 'changesFeed')
      const docsOnServer = [
        {
          doc: {
            _id: 'a'
          }
        },
        {
          doc: {
            _id: 'b'
          }
        },
        {
          doc: {
            _id: 'c'
          }
        },
        {
          doc: {
            _id: 'd'
          }
        }
      ]
      fakeChangesFeed
        .onFirstCall()
        .resolves({
          last_seq: 'abc',
          pending: 1,
          results: docsOnServer.slice(0, 3)
        })
        .onSecondCall()
        .resolves({
          last_seq: 'd',
          pending: 0,
          results: docsOnServer.slice(3)
        })

      const { docs } = await remoteCozy.changes()
      should(docs.map(doc => ({ doc }))).eql(docsOnServer)
    })
  })

  describe('find', function() {
    it('fetches a remote directory matching the given id', async function() {
      const remoteDir = await builders.remoteDir().create()

      const foundDir = await remoteCozy.find(remoteDir._id)

      foundDir.should.be.deepEqual(remoteDir)
    })

    it('fetches a remote root file including its path', async function() {
      const remoteFile = await builders
        .remoteFile()
        .inRootDir()
        .name('foo')
        .create()

      const foundFile = await remoteCozy.find(remoteFile._id)

      foundFile.should.deepEqual(_.defaults({ path: '/foo' }, remoteFile))
    })

    it('fetches a remote non-root file including its path', async function() {
      const remoteDir = await builders
        .remoteDir()
        .name('foo')
        .inRootDir()
        .create()
      const remoteFile = await builders
        .remoteFile()
        .name('bar')
        .inDir(remoteDir)
        .create()

      const foundFile = await remoteCozy.find(remoteFile._id)

      foundFile.should.deepEqual(_.defaults({ path: '/foo/bar' }, remoteFile))
    })
  })

  describe('findMaybe', function() {
    it('does the same as find() when file or directory exists', async function() {
      const remoteDir = await builders.remoteDir().create()

      const foundDir = await remoteCozy.findMaybe(remoteDir._id)

      foundDir.should.deepEqual(remoteDir)
    })

    it('returns null when file or directory is not found', async function() {
      const found = await remoteCozy.findMaybe('missing')

      should.not.exist(found)
    })
  })

  describe('findDirectoryByPath', function() {
    it('resolves when the directory exists remotely', async function() {
      const dir = await builders.remoteDir().create()
      const subdir = await builders
        .remoteDir()
        .inDir(dir)
        .create()

      const foundDir = await remoteCozy.findDirectoryByPath(dir.path)
      should(foundDir).have.properties(dir)

      const foundSubdir = await remoteCozy.findDirectoryByPath(subdir.path)
      should(foundSubdir).have.properties(subdir)
    })

    it('rejects when the directory does not exist remotely', async function() {
      await builders
        .remoteFile()
        .name('existing')
        .inRootDir()
        .create()

      for (let path of ['/missing', '/existing/missing']) {
        await remoteCozy
          .findDirectoryByPath(path)
          .should.be.rejectedWith(DirectoryNotFound)
      }
    })

    it('rejects when the path matches a file', async function() {
      await builders
        .remoteFile()
        .name('foo')
        .inRootDir()
        .create()

      await remoteCozy
        .findDirectoryByPath('/foo')
        .should.be.rejectedWith(DirectoryNotFound)
    })
  })

  describe('findOrCreateDirectoryByPath', () => {
    it('resolves with the exisisting directory if any', async function() {
      const root = await remoteCozy.findDirectoryByPath('/')
      delete root.cozyMetadata
      const dir = await builders.remoteDir().create()
      delete dir.cozyMetadata
      const subdir = await builders
        .remoteDir()
        .inDir(dir)
        .create()
      delete subdir.cozyMetadata

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
      it('creates any missing parent directory', async function() {
        const dir = await builders
          .remoteDir()
          .name('dir')
          .create()
        await builders
          .remoteDir()
          .name('subdir')
          .inDir(dir)
          .create()

        let result = await remoteCozy.findOrCreateDirectoryByPath(
          '/dir/subdir/foo'
        )
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

    it('does not swallow errors', async function() {
      this.config.cozyUrl = cozyStackDouble.url()
      const remoteCozy = new RemoteCozy(this.config)

      cozyStackDouble.stub((req, res) => {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Whatever')
      })

      await should(
        remoteCozy.findOrCreateDirectoryByPath('/whatever')
      ).be.rejected()
    })
  })

  describe('trashById', () => {
    it('resolves with a RemoteDoc representing the newly trashed item', async function() {
      const orig = await builders
        .remoteFile()
        .createdAt(2017, 1, 1, 1, 1, 1)
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
    it('is true when the folder with the given id is empty', async function() {
      const dir = await builders.remoteDir().create()
      should(await remoteCozy.isEmpty(dir._id)).be.true()

      const subdir = await builders
        .remoteDir()
        .inDir(dir)
        .create()
      should(await remoteCozy.isEmpty(dir._id)).be.false()
      should(await remoteCozy.isEmpty(subdir._id)).be.true()

      await builders
        .remoteFile()
        .inDir(dir)
        .create()
      should(await remoteCozy.isEmpty(dir._id)).be.false()
      should(await remoteCozy.isEmpty(subdir._id)).be.true()

      await builders
        .remoteFile()
        .inDir(subdir)
        .create()
      should(await remoteCozy.isEmpty(dir._id)).be.false()
      should(await remoteCozy.isEmpty(subdir._id)).be.false()
    })

    it('rejects when given a file id', async function() {
      const file = await builders.remoteFile().create()
      await should(remoteCozy.isEmpty(file._id)).be.rejectedWith(/wrong type/)
    })

    it('rejects when no document matches the id', async function() {
      await should(remoteCozy.isEmpty('missing')).be.rejectedWith({
        status: 404
      })
    })
  })

  describe('downloadBinary', function() {
    it('resolves with a Readable stream of the file content', async function() {
      const remoteFile = await builders
        .remoteFile()
        .data('foo')
        .create()

      const stream = await remoteCozy.downloadBinary(remoteFile._id)

      let data = ''
      stream.on('data', chunk => {
        data += chunk
      })
      stream.on('end', () => {
        data.should.equal('foo')
      })
    })
  })

  describe('#warnings()', () => {
    beforeEach(function() {
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
      stubWarningsResponse(402, { errors: warnings })
      should(await remoteCozy.warnings()).deepEqual(warnings)
    })

    it('is an empty array on 404 (means either no warnings or API not available)', async () => {
      stubWarningsResponse(404)
      should(await remoteCozy.warnings()).deepEqual([])
    })

    it('assumes no warnings on unexpected 200 response', async () => {
      stubWarningsResponse(200, { whatever: 'whatever' })
      should(await remoteCozy.warnings()).deepEqual([])
    })

    for (let status of [401, 500]) {
      it(`does not swallow errors ${status}`, async () => {
        stubWarningsResponse(status)
        await should(remoteCozy.warnings()).be.rejectedWith({ status })
      })
    }
  })

  describe('#capabilities', () => {
    beforeEach(async function() {
      this.config.cozyUrl = cozyStackDouble.url()
      remoteCozy = new RemoteCozy(this.config)
      remoteCozy.client.oauth = true
      remoteCozy.client._authcreds = Promise.resolve({
        token: 'fake OAuth token'
      })
    })

    const stubCapabilitiesResponse = ({ flat_subdomains }) => {
      cozyStackDouble.stub((req, res) => {
        if (req.url.match('/settings/capabilities')) {
          res.setHeader('Content-Type', 'application/json')
          res.writeHead(200)
          res.end(
            JSON.stringify({
              data: {
                type: 'io.cozy.settings',
                id: 'io.cozy.settings.capabilities',
                attributes: { flat_subdomains }
              }
            })
          )
        } else {
          res.writeHead(404)
          res.end()
        }
      })
    }

    it('returns an object with a flatSubdomains boolean attribute', async () => {
      stubCapabilitiesResponse({ flat_subdomains: true })
      should(await remoteCozy.capabilities()).deepEqual({
        flatSubdomains: true
      })

      stubCapabilitiesResponse({ flat_subdomains: false })
      should(await remoteCozy.capabilities()).deepEqual({
        flatSubdomains: false
      })
    })
  })
})

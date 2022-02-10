/* eslint-env mocha */
/* @flow weak */

const _ = require('lodash')
const path = require('path')
const should = require('should')
const sinon = require('sinon')
const electronFetch = require('electron-fetch')
const { FetchError } = require('cozy-stack-client')
const OldCozyClient = require('cozy-client-js').Client
const CozyClient = require('cozy-client').default

const {
  ROOT_DIR_ID,
  TRASH_DIR_ID,
  TRASH_DIR_NAME,
  MAX_FILE_SIZE
} = require('../../../core/remote/constants')
const { RemoteCozy } = require('../../../core/remote/cozy')
const { withDefaultValues } = require('../../../core/remote/document')
const { DirectoryNotFound } = require('../../../core/remote/errors')

const configHelpers = require('../../support/helpers/config')
const cozyHelpers = require('../../support/helpers/cozy')
const { COZY_URL, cozy, deleteAll } = require('../../support/helpers/cozy')
const CozyStackDouble = require('../../support/doubles/cozy_stack')
const Builders = require('../../support/builders')

const cozyStackDouble = new CozyStackDouble()
const builders = new Builders({ cozy })

// This error with a mysterious reason is returned when the request is aborted
// with an error message by the remote server while Chromium has sent all data.
// See bugs.chromium.org/p/chromium/issues/detail?id=1033945
// In this case, Electron returns this mysterious "mojo result not ok" reason.
// See https://github.com/electron/electron/blob/ed126eced457fcaa3c998b32f97d68576e7f362c/shell/browser/api/electron_api_url_loader.cc#L212
const CHROMIUM_ERROR = new electronFetch.FetchError(
  `request to https://example.org failed, reason: mojo result not ok`,
  'system',
  new Error('mojo result not ok')
)

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
    // Use real OAuth client
    remoteCozy.client = cozyHelpers.cozy
  })

  describe('hasEnoughSpace', () => {
    it('returns true if the Cozy does not have a quota', async () => {
      const fakeSettings = sinon
        .stub(remoteCozy.client.settings, 'diskUsage')
        .resolves({ attributes: { used: 843 } })

      await should(remoteCozy.hasEnoughSpace(200)).be.fulfilledWith(true)

      fakeSettings.restore()
    })

    it('returns true if the remaining quota is greater than the given file size', async () => {
      const fakeSettings = sinon
        .stub(remoteCozy.client.settings, 'diskUsage')
        .resolves({ attributes: { quota: 5000, used: 4800 } })

      await should(remoteCozy.hasEnoughSpace(200)).be.fulfilledWith(true)

      fakeSettings.restore()
    })

    it('returns false if the remaining quota is smaller than the given file size', async () => {
      const fakeSettings = sinon
        .stub(remoteCozy.client.settings, 'diskUsage')
        .resolves({ attributes: { quota: 5000, used: 4801 } })

      await should(remoteCozy.hasEnoughSpace(200)).be.fulfilledWith(false)

      fakeSettings.restore()
    })
  })

  describe('createFile', () => {
    context('when the name starts or ends with a space', () => {
      it('creates the file with the given name', async () => {
        const data = builders
          .stream()
          .push('')
          .build()
        const checksum = builders.checksum('').build()

        should(
          await remoteCozy.createFile(data, {
            name: ' foo ',
            dirID: ROOT_DIR_ID,
            contentType: 'text/plain',
            contentLength: 0,
            checksum,
            executable: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          })
        ).have.properties({
          type: 'file',
          name: ' foo '
        })
      })
    })

    context('when the request fails with a mysterious Chromium error', () => {
      const stubFetch = () => {
        // This cannot be declared outside `stubFetch()` as it would not have
        // gone through the proxy setup yet and calls would fail.
        const originalFetch = global.fetch

        sinon.stub(global, 'fetch')
        global.fetch.onFirstCall().callsFake(async (url, options) => {
          await originalFetch(url, options)
          throw CHROMIUM_ERROR
        })
        global.fetch.callThrough()
      }
      afterEach(() => {
        if (global.fetch.restore) {
          global.fetch.restore()
        }
      })

      it('rejects with a 409 FetchError if a doc with the same path exists', async () => {
        await builders
          .remoteDir()
          .inRootDir()
          .name('foo')
          .create()

        stubFetch()
        await should(
          remoteCozy.createFile(builders.stream().build(), {
            name: 'foo',
            dirID: ROOT_DIR_ID,
            contentType: 'text/plain',
            contentLength: 300,
            checksum: 'md5sum',
            executable: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          })
        ).be.rejectedWith(FetchError, { status: 409 })
      })

      it('rejects with a 412 FetchError if the data sent is larger than the size in the metadata', async () => {
        const data = 'data'
        const checksum = await builders.checksum(data).create()

        stubFetch()
        await should(
          remoteCozy.createFile(
            builders
              .stream()
              .push(data)
              .build(),
            {
              name: 'foo',
              dirID: ROOT_DIR_ID,
              contentType: 'text/plain',
              contentLength: data.length - 1,
              checksum,
              executable: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          )
        ).be.rejectedWith(FetchError, { status: 412 })
      })

      it('rejects with a 412 FetchError if the data sent is smaller than the size in the metadata', async () => {
        const data = 'data'
        const checksum = builders.checksum(data).build()

        stubFetch()
        await should(
          remoteCozy.createFile(
            builders
              .stream()
              .push(data)
              .build(),
            {
              name: 'foo',
              dirID: ROOT_DIR_ID,
              contentType: 'text/plain',
              contentLength: data.length + 1,
              checksum,
              executable: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          )
        ).be.rejectedWith(FetchError, { status: 412 })
      })

      it('rejects with a 413 FetchError if the file is larger than the available quota', async () => {
        const fakeSettings = sinon
          .stub(remoteCozy.client.settings, 'diskUsage')
          .resolves({ attributes: { quota: 5000, used: 4800 } })

        stubFetch()
        await should(
          remoteCozy.createFile(builders.stream().build(), {
            name: 'foo',
            dirID: ROOT_DIR_ID,
            contentType: 'text/plain',
            contentLength: 300,
            checksum: 'md5sum',
            executable: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          })
        ).be.rejectedWith(FetchError, { status: 413 })

        fakeSettings.restore()
      })

      it('rejects with a 413 FetchError if the file is larger than the max file size', async () => {
        stubFetch()
        await should(
          remoteCozy.createFile(builders.stream().build(), {
            name: 'foo',
            dirID: ROOT_DIR_ID,
            contentType: 'text/plain',
            contentLength: MAX_FILE_SIZE + 1,
            checksum: 'md5sum',
            executable: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          })
        ).be.rejectedWith(FetchError, { status: 413 })
      })

      it('rejects with the Chromium error otherwise', async () => {
        const data = 'data'

        stubFetch()
        await should(
          remoteCozy.createFile(
            builders
              .stream()
              .push(data)
              .build(),
            {
              name: 'foo',
              dirID: ROOT_DIR_ID,
              contentType: 'text/plain',
              contentLength: data.length,
              checksum: 'md5sum', // Force a request failure with a bad checksum
              executable: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          )
        ).be.rejectedWith(CHROMIUM_ERROR)
      })
    })
  })

  describe('createDirectory', () => {
    context('when the name starts or ends with a space', () => {
      it('creates the directory with the given name', async () => {
        should(
          await remoteCozy.createDirectory({
            name: ' foo ',
            dirID: ROOT_DIR_ID,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          })
        ).have.properties({
          type: 'directory',
          name: ' foo '
        })
      })
    })
  })

  describe('updateFileById', () => {
    context('when the name starts or ends with a space', () => {
      it('updates the file with the given name', async () => {
        const remoteFile = await builders
          .remoteFile()
          .inRootDir()
          .name(' foo ')
          .data('initial content')
          .create()

        const data = builders
          .stream()
          .push('')
          .build()
        const checksum = builders.checksum('').build()

        should(
          await remoteCozy.updateFileById(remoteFile._id, data, {
            contentType: 'text/plain',
            contentLength: 0,
            checksum,
            executable: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          })
        ).have.properties({
          type: 'file',
          name: ' foo ',
          md5sum: '1B2M2Y8AsgTpgAmY7PhCfg=='
        })
      })
    })

    context('when the request fails with a mysterious Chromium error', () => {
      let remoteFile
      beforeEach(async () => {
        remoteFile = await builders
          .remoteFile()
          .inRootDir()
          .name('foo')
          .data('initial content')
          .create()

        sinon
          .stub(remoteCozy.client.files, 'updateById')
          .rejects(CHROMIUM_ERROR)
      })
      afterEach(() => {
        remoteCozy.client.files.updateById.restore()
      })

      it('returns a 413 FetchError if the file is larger than the available quota', async () => {
        const fakeSettings = sinon
          .stub(remoteCozy.client.settings, 'diskUsage')
          .resolves({ attributes: { quota: 5000, used: 4800 } })

        await should(
          remoteCozy.updateFileById(remoteFile._id, builders.stream().build(), {
            contentType: 'text/plain',
            contentLength: 300,
            checksum: 'md5sum',
            executable: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ifMatch: remoteFile._rev
          })
        ).be.rejectedWith(FetchError, { status: 413 })

        fakeSettings.restore()
      })
    })
  })

  describe('updateAttributesById', () => {
    context('when the name starts or ends with a space', () => {
      it('updates the file with the given name', async () => {
        const remoteFile = await builders
          .remoteFile()
          .inRootDir()
          .name(' foo')
          .data('initial content')
          .create()

        should(
          await remoteCozy.updateAttributesById(remoteFile._id, {
            name: 'bar ',
            updatedAt: new Date().toISOString()
          })
        ).have.properties({
          type: 'file',
          name: 'bar '
        })
      })
    })
  })

  describe('changes', function() {
    context('when no seq given', function() {
      // XXX: This test might timeout if a lot of changes were made on the
      // remote Cozy as we're doing an initial fetch here and thus cannot speed
      // it up by ignoring the previous changes.
      it('resolves only with non trashed, non deleted docs', async function() {
        const dir = await builders.remoteDir().create()
        const file = await builders
          .remoteFile()
          .inDir(dir)
          .create()
        const deletedFile = await builders
          .remoteFile()
          .inDir(dir)
          .create()
        await builders.remoteErased(deletedFile).create()
        const trashedFile = await builders
          .remoteFile()
          .inDir(dir)
          .create()
        await builders
          .remoteFile(trashedFile)
          .trashed()
          .update()

        const { docs } = await remoteCozy.changes()

        const ids = docs.map(doc => doc._id)
        should(ids)
          .containDeep([dir._id, file._id])
          .and.have.length(2)
      })
    })

    it('resolves with changes since the given seq', async function() {
      const last_seq = await remoteCozy.fetchLastSeq()

      const dir = await builders.remoteDir().create()
      const file = await builders
        .remoteFile()
        .inDir(dir)
        .create()

      const { docs } = await remoteCozy.changes(last_seq)
      const ids = docs.map(doc => doc._id)

      should(ids.sort()).eql([file._id, dir._id].sort())
    })

    it('resolves with docs ordered by path asc', async function() {
      const last_seq = await remoteCozy.fetchLastSeq()

      const dirB = await builders
        .remoteDir()
        .inRootDir()
        .name('dirB')
        .create()
      const fileB = await builders
        .remoteFile()
        .inRootDir()
        .name('fileB')
        .create()
      const dirA = await builders
        .remoteDir()
        .inRootDir()
        .name('dirA')
        .create()
      const fileA = await builders
        .remoteFile()
        .inDir(dirA)
        .name('fileA')
        .create()

      const { docs } = await remoteCozy.changes(last_seq)

      should(docs).containDeepOrdered([dirA, fileA, dirB, fileB])
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

      // `since` is not '0' so we don't try to run an initial fetch which is not
      // faked here.
      const { docs } = await remoteCozy.changes('')
      should(docs.map(doc => ({ doc }))).eql(
        docsOnServer.map(({ doc }) => ({ doc: withDefaultValues(doc) }))
      )
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

  describe('isNameTaken', function() {
    it('returns true when a doc with the given name exists in the given directory', async () => {
      const remoteDir = await builders
        .remoteDir()
        .name('foo')
        .inRootDir()
        .create()
      await builders
        .remoteFile()
        .name('bar')
        .inDir(remoteDir)
        .create()
      await builders
        .remoteDir()
        .name('baz')
        .inDir(remoteDir)
        .create()

      await should(
        remoteCozy.isNameTaken({ name: 'bar', dir_id: remoteDir._id })
      ).be.fulfilledWith(true)
      await should(
        remoteCozy.isNameTaken({ name: 'baz', dir_id: remoteDir._id })
      ).be.fulfilledWith(true)
    })

    it('returns false when there are no docs with the given name', async () => {
      const remoteDir = await builders
        .remoteDir()
        .name('foo')
        .inRootDir()
        .create()

      await should(
        remoteCozy.isNameTaken({ name: 'bar', dir_id: remoteDir._id })
      ).be.fulfilledWith(false)
    })

    it('returns false when a doc with the given name exists in another directory', async () => {
      const remoteDir = await builders
        .remoteDir()
        .name('foo')
        .inRootDir()
        .create()
      await builders
        .remoteFile()
        .name('bar')
        .create()

      await should(
        remoteCozy.isNameTaken({ name: 'bar', dir_id: remoteDir._id })
      ).be.fulfilledWith(false)
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

  describe('trashById', () => {
    it('resolves with a RemoteDoc representing the newly trashed item', async function() {
      const orig = await builders
        .remoteFile()
        .createdAt(2017, 1, 1, 1, 1, 1)
        .create()

      const trashed = await remoteCozy.trashById(orig._id)

      should(trashed).have.properties({
        _id: orig._id,
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
        // A strict equality check would prevent us from adding query-string
        // parameters to the request.
        if (req.url.includes('/status/')) res.end('{}')
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
      remoteCozy.client._authstate = 3 // XXX: AuthOK
      remoteCozy.client._authcreds = Promise.resolve({
        // Fake OAuth tokens
        token: {
          tokenType: 'bearer',
          accessToken: 'xxx',
          refreshToken: 'xxx',
          scope: 'io.cozy.doctypes',
          toAuthHeader: () => 'xxx'
        }
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

  describe('#getDirectoryContent', () => {
    beforeEach(function() {
      remoteCozy.client = new OldCozyClient({
        cozyURL: this.config.cozyUrl,
        token: process.env.COZY_STACK_TOKEN
      })
    })

    it('returns the whole directory content, including the content of subdirectories', async () => {
      const tree = await builders.createRemoteTree([
        'dir/',
        'dir/subdir/',
        'dir/subdir/subsubdir/',
        'dir/subdir/file',
        'dir/file',
        'dir/other-subdir/',
        'dir/other-subdir/next-level/',
        'dir/other-subdir/next-level/last-level/',
        'dir/other-subdir/next-level/last-level/content',
        'dir/subdir/subsubdir/last',
        'hello.txt',
        'other-dir/',
        'other-dir/content'
      ])
      await should(
        remoteCozy.getDirectoryContent(tree['dir/'])
      ).be.fulfilledWith([
        tree['dir/file'],
        tree['dir/other-subdir/'],
        tree['dir/other-subdir/next-level/'],
        tree['dir/other-subdir/next-level/last-level/'],
        tree['dir/other-subdir/next-level/last-level/content'],
        tree['dir/subdir/'],
        tree['dir/subdir/file'],
        tree['dir/subdir/subsubdir/'],
        tree['dir/subdir/subsubdir/last']
      ])
    })

    it('requests content level by level and not directory by directory', async () => {
      const tree = await builders.createRemoteTree([
        'dir/',
        'dir/file',
        'dir/subdir/',
        'dir/subdir/file',
        'dir/subdir/subsubdir/',
        'dir/subdir/subsubdir/last',
        'dir/other-subdir/',
        'dir/other-subdir/next-level/',
        'dir/other-subdir/next-level/last-level/',
        'dir/other-subdir/next-level/last-level/content',
        'other-dir/',
        'other-dir/content'
      ])

      const client = await remoteCozy.newClient()
      const querySpy = sinon.spy(client, 'query')
      try {
        await remoteCozy.getDirectoryContent(tree['dir/'], { client })

        should(querySpy).have.callCount(4)
      } finally {
        querySpy.restore()
      }
    })

    it('does not fail on an empty directory', async () => {
      const dir = await builders
        .remoteDir()
        .name('dir')
        .create()
      await should(remoteCozy.getDirectoryContent(dir)).be.fulfilledWith([])
    })

    it('fails on a sub-directory content request failure', async () => {
      const tree = await builders.createRemoteTree([
        'dir/',
        'dir/subdir/',
        'dir/subdir/subsubdir/',
        'dir/subdir/file',
        'dir/file',
        'dir/subdir/subsubdir/last',
        'hello.txt',
        'other-dir/',
        'other-dir/content'
      ])

      const stubbedClient = await remoteCozy.newClient()
      const originalQuery = stubbedClient.query.bind(stubbedClient)
      sinon.stub(stubbedClient, 'query').callsFake(async queryDef => {
        if (queryDef.selector.dir_id.$in.includes(tree['dir/subdir/']._id)) {
          throw new Error('test error')
        } else {
          return originalQuery(queryDef)
        }
      })

      await should(
        remoteCozy.getDirectoryContent(tree['dir/'], { client: stubbedClient })
      ).be.rejectedWith(/test error/)
    })
  })
})

describe('RemoteCozy.newClient', () => {
  // XXX: Webapp token based clients are only used in tests but we should make
  // sure tests won't fail because they can't build a valid CozyClient instance.
  context('with a webapp token based cozy-client-js client', () => {
    beforeEach('instanciate config', configHelpers.createConfig)
    beforeEach('registerClient', configHelpers.registerClient)
    afterEach('clean config directory', configHelpers.cleanConfig)

    let webappCozy
    beforeEach(function() {
      webappCozy = new RemoteCozy(this.config)
      webappCozy.client = cozyHelpers.cozy
    })

    it('returns a cozy-client CozyClient instance', async () => {
      should(await webappCozy.newClient()).be.an.instanceOf(CozyClient)
    })
  })

  context('with an OAuth based cozy-client-js client', () => {
    beforeEach('instanciate config', configHelpers.createConfig)
    beforeEach('register OAuth client', configHelpers.registerOAuthClient)
    afterEach('clean config directory', configHelpers.cleanConfig)

    let oauthCozy
    beforeEach(async function() {
      oauthCozy = new RemoteCozy(this.config)
      oauthCozy.client = await cozyHelpers.oauthCozy(this.config)
    })

    it('returns a cozy-client CozyClient instance', async () => {
      should(await oauthCozy.newClient()).be.an.instanceOf(CozyClient)
    })

    context('when the client was not authorized yet', () => {
      it('handles OAuth cozy-client-js clients without credentials', async function() {
        oauthCozy.client = new OldCozyClient({
          cozyURL: this.config.cozyUrl,
          oauth: {
            clientParams: this.config.client,
            storage: this.config
          }
        })
        should(await oauthCozy.newClient()).be.an.instanceOf(CozyClient)
      })
    })
  })
})

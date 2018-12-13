/* @flow */
/* eslint-env mocha */

const should = require('should')
const sinon = require('sinon')
const crypto = require('crypto')
const fetch = require('isomorphic-fetch')
const _ = require('lodash')

const metadata = require('../../core/metadata')
const Builders = require('../support/builders')

const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const { IntegrationTestHelpers } = require('../support/helpers/integration')
/*::
import type { RemoteDoc } from '../../core/remote/document'
*/
const cozy = cozyHelpers.cozy
const COUCHDB_URL = process.env.COUCHDB_URL || 'http://localhost:5984'

describe('Re-Upload files when the stack report them as broken', () => {
  let helpers, builders

  before(async function dontRunIfCouchdbIsNotAccessible () {
    try {
      await fetch(COUCHDB_URL)
    } catch (err) {
      console.log('it cant be run if the couch is not accessible ', err)
      this.skip()
    }
  })

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(() => helpers.local.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(function () {
    helpers = new IntegrationTestHelpers(this.config, this.pouch, cozy)
    helpers.local.setupTrash()
    builders = new Builders({cozy, pouch: this.pouch})
  })

  const GOODSIZE = 64022
  const BADSIZE = 22
  const GOODDATA = Buffer.alloc(GOODSIZE, 'a', 'utf8')
  const BADDATA = Buffer.alloc(BADSIZE, 'file-corrupted-content', 'utf8')
  const GOODCHECKSUM = crypto.createHash('md5').update(GOODDATA).digest('base64')
  const BADCHECKSUM = crypto.createHash('md5').update(BADDATA).digest('base64')

  it('No download when the remote file is corrupted (md5sum does not match content) - no download', async () => {
    const fileName = 'file-corrupted-md5sum'
    const remoteFile = await setupContentMismatchRemote({
      fileName,
      storageContent: BADDATA,
      couchChecksum: GOODCHECKSUM,
      couchSize: GOODSIZE
    })

    await helpers.pullAndSyncAll()
    should(await helpers._pouch.byRemoteIdMaybeAsync(remoteFile._id))
      .have.property('errors')
    should(helpers.local.syncDir.existsSync(fileName)).be.false()
  })

  it('No download when the remote file is corrupted (size does not match content) - no download', async () => {
    const fileName = 'file-corrupted-size'
    const remoteFile = await setupContentMismatchRemote({
      fileName,
      storageContent: BADDATA,
      couchChecksum: BADCHECKSUM,
      couchSize: GOODSIZE
    })

    await helpers.pullAndSyncAll()
    should(await helpers._pouch.byRemoteIdMaybeAsync(remoteFile._id))
      .have.property('errors')
    should(helpers.local.syncDir.existsSync(fileName)).be.false()
  })

  it('If the metadata in pouchdb are ok, fix once', async () => {
    // HACK: to get in the same state than if this desktop had uploaded a file which got corrupted
    const fileName = 'file-corrupted-fixable'

    await setupContentMismatchBothSides({
      fileName,
      storageContent: BADDATA,
      localContent: GOODDATA,
      pouchChecksum: GOODCHECKSUM,
      pouchSize: GOODSIZE,
      couchChecksum: BADCHECKSUM,
      couchSize: GOODSIZE
    })

    const overwriteFileAsync = sinon.spy(helpers.remote.remote, 'overwriteFileAsync')

    await helpers._sync.reuploadContentMismatchFiles()
    should(overwriteFileAsync).have.been.calledOnce() // fix once

    // should actually fix the problem
    // XXX may fail against a true cozy-stack due to fsck caching
    should(await helpers.remote.remote.remoteCozy.fetchFileCorruptions()).have.length(0)

    await helpers._sync.reuploadContentMismatchFiles()
    should(overwriteFileAsync).have.been.calledOnce() // dont fix twice

    await helpers.syncAll()
    should(overwriteFileAsync).have.been.calledOnce() // should be uptodate
  })

  it('If the metadata in pouchdb are bad, dont upload', async () => {
    // HACK: pretends the file is corrupted in pouchdb
    // This should never happens with newer version of desktop
    // but some installation may have bad data in pouchdb before we started
    // checking size upon downloading a file.

    const fileName = 'file-corrupted-md5sum-unfixable'

    await setupContentMismatchBothSides({
      fileName,
      storageContent: BADDATA,
      localContent: BADDATA,
      pouchChecksum: BADCHECKSUM,
      pouchSize: BADSIZE,
      couchChecksum: BADCHECKSUM,
      couchSize: GOODSIZE
    })

    const overwriteFileAsync = sinon.spy(helpers.remote.remote, 'overwriteFileAsync')
    await helpers._sync.reuploadContentMismatchFiles()
    should(overwriteFileAsync).not.have.been.called() // dont re-upload bad version
  })

  /// ----- HELPERS FUNCTIONS

  async function fetchJSON (url, opts) { return (await fetch(url, opts)).json() }

  async function corruptFileInCouchdb (remoteFile /*: RemoteDoc */, merge /*: Object */) {
    const instancesURL = COUCHDB_URL + '/global%2Finstances/' +
      '_design/domain-and-aliases/_view/domain-and-aliases/?include_docs=true'

    const rows = (await fetchJSON(instancesURL)).rows
    if (rows.length !== 1) console.log('WARNING Possibly picking wrong instance')

    const prefix = rows[0].doc.prefix
    const fileURL = `${COUCHDB_URL}/${prefix}%2Fio-cozy-files/${remoteFile._id}`
    if (merge.size) merge.size = '' + merge.size // size is a string in couchdb
    const remoteDoc = _.merge((await fetchJSON(fileURL)), merge)
    return fetchJSON(fileURL, {method: 'PUT', body: JSON.stringify(remoteDoc)})
  }

  async function setupContentMismatchRemote (opts) {
    const {
      fileName,
      storageContent,
      couchChecksum,
      couchSize
    } = opts
    const remoteFile = await builders.remote.file()
                        .name(fileName)
                        .data(storageContent)
                        .create()

    const changes = {}
    if (couchChecksum) changes.md5sum = couchChecksum
    if (couchSize) changes.size = couchSize

    await corruptFileInCouchdb(remoteFile, changes)
    should(await helpers.remote.remote.remoteCozy.fetchFileCorruptions()).have.length(1)

    return remoteFile
  }

  async function setupContentMismatchBothSides (opts) {
    const {
      fileName,
      storageContent,
      localContent,
      pouchChecksum,
      pouchSize,
      couchChecksum,
      couchSize
    } = opts

    await helpers.local.syncDir.outputFile(fileName, storageContent)
    await helpers.local.scan()
    await helpers.syncAll()
    // XXX may cause issue if scan is called again
    await helpers.local.syncDir.outputFile(fileName, localContent)

    const pouchFile = await helpers._pouch.db.get(metadata.id(fileName))

    const remoteFile = await helpers._remote.remoteCozy.find(pouchFile.remote._id)

    const changes = {}
    if (couchChecksum) changes.md5sum = couchChecksum
    if (couchSize) changes.size = couchSize
    const {rev: newRev} = await corruptFileInCouchdb(remoteFile, changes)
    should(await helpers.remote.remote.remoteCozy.fetchFileCorruptions()).have.length(1)

    pouchFile.remote._rev = newRev
    pouchFile.size = pouchSize
    pouchFile.md5sum = pouchChecksum

    await helpers._pouch.put(pouchFile)
  }
})

/* @flow */
/* eslint-env mocha */

const should = require('should')
const fse = require('fs-extra')
const path = require('path')
const _ = require('lodash')

const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const TestHelpers = require('../support/helpers')

const cozy = cozyHelpers.cozy

describe('Update only a file mtime', () => {
  let helpers

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(() => helpers.local.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(function () {
    helpers = TestHelpers.init(this)
    helpers.local.setupTrash()
  })

  it('remote', async () => {
    await helpers.remote.ignorePreviousChanges()
    const localPath = path.join(helpers.local.syncPath, 'file')

    const file = await cozy.files.create('basecontent', {name: 'file'})
    await helpers.remote.pullChanges()
    await helpers.syncAll()

    // update only the file mtime
    await cozy.files.updateById(file._id, 'changedcontent', {contentType: 'text/plain'})
    await cozy.files.updateById(file._id, 'basecontent', {contentType: 'text/plain'})

    const statBefore = await fse.stat(localPath)
    helpers.spyPouch()
    await helpers.remote.pullChanges()
    await helpers.syncAll()

    const statAfter = await fse.stat(localPath)
    statBefore.mtime.toISOString().should.equal(statAfter.mtime.toISOString())

    // actually change the file
    await fse.appendFile(localPath, ' appended')
    const stats = await fse.stat(localPath)

    await helpers.local.simulateEvents([{
      type: 'change',
      path: 'file',
      stats: stats
    }])

    await helpers.syncAll()

    should(await fse.readFile(localPath, 'utf8')).equal('basecontent appended')
    should((await fse.stat(localPath)).mtime).not.equal(statAfter.mtime)
  })

  it('local', async () => {
    await helpers.remote.ignorePreviousChanges()

    var d = new Date()
    d.setDate(d.getDate() - 1)

    const file = await cozy.files.create('basecontent', {name: 'file', lastModifiedDate: d})
    await helpers.remote.pullChanges()
    await helpers.syncAll()

    d.setDate(d.getDate() + 1)

    helpers.spyPouch()

    const oldFile = await helpers._pouch.byRemoteIdMaybeAsync(file._id)
    await helpers.prep.updateFileAsync('local', _.merge(
      {
        path: 'file',
        updated_at: d.toISOString()
      },
      _.pick(oldFile, ['docType', 'md5sum', 'mime', 'class', 'size', 'remote'])
    ))

    await helpers.syncAll()

    // no change saved
    should(helpers.putDocs('path')).deepEqual([])
  })
})

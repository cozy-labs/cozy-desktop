/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const path = require('path')
const should = require('should')

const Helpers = require('../support/helpers')
const { onPlatform } = require('../support/helpers/platform')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const scenarioHelpers = require('../support/helpers/scenarios')

describe('Fileid migration', () => {
  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  let helpers

  // Arbo synchro sans fileids dans le Pouch avec des fichiers
  // Scan initial
  beforeEach(async function () {
    helpers = Helpers.init(this)
    await helpers.local.setupTrash()
    const scenario = {
      init: [
        {path: 'dir/'},
        {path: 'dir/file.txt'}
      ]
    }
    const { abspath } = helpers.local.syncDir
    const useRealInodes = true
    await scenarioHelpers.init(scenario, this.pouch, abspath, path.normalize, useRealInodes)
    await helpers.remote.ignorePreviousChanges()
  })

  let docsWithFileIds

  beforeEach(async function () {
    const docs = await this.pouch.byRecursivePathAsync('')
    docsWithFileIds = _.cloneDeep(docs)
    for (const doc of docs) {
      // Simulate Pouch state before first use of atom watcher:
      delete doc.fileid
      // Fix test instrumentation issues:
      doc.sides = {local: 2, remote: 2}
      // if (doc.executable === false) delete doc.executable
    }
    this.pouch.bulkDocs(docs)
  })

  const omitRevs = docs => _.map(docs, doc => _.omit(doc, ['_rev', 'updatedAt']))

  onPlatform('win32', () => {
    describe('initial scan', () => {
      beforeEach(() => helpers.local.scan())

      it('saves fileids on initial scan', async function () {
        let expectedDocs = docsWithFileIds.map(doc =>
          _.defaults(
            {sides: {local: 3, remote: 2}},
            doc.executable ? doc : _.omit(doc, ['executable'])
          )
        )
        let actualDocs = await this.pouch.byRecursivePathAsync('')
        should(omitRevs(actualDocs)).deepEqual(omitRevs(expectedDocs))

        await helpers.syncAll()

        expectedDocs = docsWithFileIds.map(doc =>
          _.defaults(
            {sides: {local: 4, remote: 4}},
            doc.executable ? doc : _.omit(doc, ['executable'])
          )
        )
        actualDocs = await this.pouch.byRecursivePathAsync('')
        should(omitRevs(actualDocs)).deepEqual(omitRevs(expectedDocs))

        await helpers.remote.pullChanges()

        expectedDocs = docsWithFileIds.map(doc =>
          _.defaults(
            {sides: {local: 4, remote: 4}},
            doc.executable ? doc : _.omit(doc, ['executable'])
          )
        )
        actualDocs = await this.pouch.byRecursivePathAsync('')
        should(omitRevs(actualDocs)).deepEqual(omitRevs(expectedDocs))
      })
    })
  })
})

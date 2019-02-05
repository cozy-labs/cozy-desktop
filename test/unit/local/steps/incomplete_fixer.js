/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const path = require('path')

const should = require('should')
const Builders = require('../../../support/builders')
const configHelpers = require('../../../support/helpers/config')
const pouchHelpers = require('../../../support/helpers/pouch')
const { ContextDir } = require('../../../support/helpers/context_dir')

const metadata = require('../../../../core/metadata')
const Buffer = require('../../../../core/local/steps/buffer')
const incompleteFixer = require('../../../../core/local/steps/incomplete_fixer')

const completedEvent = event =>
  _.pick(event, ['_id', 'path', 'kind', 'md5sum', 'action', 'incomplete'])

const completionChanges = async (buffer) => await buffer.pop().map(completedEvent)

describe('local/steps/initialDiff', () => {
  let builders
  let syncDir
  let buffer
  let options

  const CHECKSUM = 'checksum'
  const checksumer = {
    push: path => CHECKSUM,
    kill: () => {}
  }

  before('instanciate config', configHelpers.createConfig)
  before(function () {
    options = { syncPath: this.config.syncPath, checksumer }
    syncDir = new ContextDir(this.config.syncPath)
  })
  beforeEach('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('populate pouch with documents', function () {
    builders = new Builders({pouch: this.pouch})
    buffer = new Buffer()
  })
  afterEach('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  context('without any complete "renamed" event', () => {
    it('drops incomplete events', async function () {
      const events = [
        builders.event().incomplete().action('created').path('foo1').build(),
        builders.event().incomplete().action('modified').path('foo2').build(),
        builders.event().incomplete().action('deleted').path('foo3').build(),
        builders.event().incomplete().action('scan').path('foo4').build(),
        builders.event().action('initial-scan-done').path('').build()
      ]
      buffer.push(_.cloneDeep(events))

      const completedBuffer = await incompleteFixer.loop(buffer, options)
      should(await completedBuffer.pop()).deepEqual([
        events[events.length - 1]
      ])
    })
  })

  context('with a complete "renamed" event in the batch', () => {
    it('leaves complete events untouched', async function () {
      const events = [
        builders.event().action('created').path('file').build(),
        builders.event().action('renamed').oldPath('file').path('foo').build()
      ]
      buffer.push(_.cloneDeep(events))

      const completedBuffer = await incompleteFixer.loop(buffer, options)
      should(await completedBuffer.pop()).deepEqual(events)
    })

    it('rebuilds the first incomplete event matching the "renamed" event old path', async function () {
      const events = [
        builders.event().incomplete().kind('file').action('created').path('src/foo1').build(),
        builders.event().incomplete().kind('file').action('modified').path('src/foo2').build(),
        builders.event().incomplete().kind('file').action('deleted').path('src/foo3').build(),
        builders.event().incomplete().kind('file').action('renamed').oldPath('src/foo4').path('foo').build(),
        builders.event().incomplete().kind('file').action('scan').path('src/foo5').build(),
      ]
      const renamed = builders.event().kind('directory').action('renamed').oldPath('src').path('dst').build()
      const initialScanDone = builders.event().action('initial-scan-done').path('').build()
      buffer.push(_.cloneDeep(events))
      buffer.push(_.cloneDeep([renamed, initialScanDone]))

      // Create actual files in `dst/` since their parent folder has been moved
      const files = events.map(event => {
        const newPath = event.path.replace('src', 'dst')
        if (event.kind === 'directory') {
          return syncDir.ensureDir(newPath)
        } else if (event.kind === 'file' && event.action !== 'deleted') {
          return syncDir.outputFile(newPath, 'content')
        }
      })
      await Promise.all(files)

      const completedBuffer = await incompleteFixer.loop(buffer, options)

      const changes = await completionChanges(completedBuffer)
      should(changes).deepEqual([
        completedEvent(renamed),
        completedEvent(initialScanDone),
        {
          _id: metadata.id(path.normalize('dst/foo1')),
          path: path.normalize('dst/foo1'),
          kind: 'file',
          md5sum: CHECKSUM,
          action: 'created'
        },
      ])
    })
  })
})

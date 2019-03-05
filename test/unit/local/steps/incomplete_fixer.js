/* eslint-env mocha */
/* @flow */

const should = require('should')
const sinon = require('sinon')

const Buffer = require('../../../../core/local/steps/buffer')
const incompleteFixer = require('../../../../core/local/steps/incomplete_fixer')

const Builders = require('../../../support/builders')

const builders = new Builders()

describe('core/local/steps/incomplete_fixer', () => {
  const syncPath = __dirname

  let checksumer

  beforeEach(() => {
    checksumer = {
      push: sinon.stub().resolves(),
      kill: sinon.stub()
    }
  })

  describe('.loop()', () => {
    it('pushes a fixed event into the output buffer', async () => {
      const createdEvent = builders.event()
        .kind('file')
        .action('created')
        .path('missing')
        .incomplete()
        .build()
      const renamedEvent = builders.event()
        .kind(createdEvent.kind)
        .action('renamed')
        .oldPath(createdEvent.path)
        .path(__filename)
        .build()
      const inputBuffer = new Buffer()
      const outputBuffer = incompleteFixer.loop(inputBuffer, {syncPath, checksumer})

      inputBuffer.push([createdEvent])
      inputBuffer.push([renamedEvent])

      should(await outputBuffer.pop()).deepEqual([
        {
          _id: renamedEvent._id,
          action: 'renamed',
          kind: 'file',
          oldPath: createdEvent.path,
          path: renamedEvent.path,
          stats: renamedEvent.stats
        }
      ])
    })
  })
})

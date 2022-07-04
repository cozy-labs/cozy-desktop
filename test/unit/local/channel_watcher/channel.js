/* eslint-env mocha */
/* @flow */

const Promise = require('bluebird')
const _ = require('lodash')
const should = require('should')
const sinon = require('sinon')

const Channel = require('../../../../core/local/channel_watcher/channel')

const Builders = require('../../../support/builders')

/*::
import type {
  ChannelBatch
} from '../../../../core/local/channel_watcher/event'
*/

const builders = new Builders()

describe('core/local/channel_watcher/Channel', function () {
  this.timeout(100)

  describe('Basics', () => {
    let channel

    beforeEach('instanciate', () => {
      channel = new Channel()
    })

    describe('#push()', () => {
      it('inserts the given Batch into the Channel so it may be retrieved with #pop()', async () => {
        const batch = builders.nonEmptyBatch()

        channel.push(batch)

        await should(channel.pop()).be.fulfilledWith(batch)
      })

      it('does not squash equivalent batches', async () => {
        const batch = builders.nonEmptyBatch()

        channel.push(batch)
        channel.push(batch)

        await should(channel.pop()).be.fulfilledWith(batch)
        await should(channel.pop()).be.fulfilledWith(batch)
      })

      it('drops empty batches', async () => {
        const emptyBatch = []
        const batch = builders.nonEmptyBatch()

        channel.push(emptyBatch)
        channel.push(batch)

        await should(channel.pop()).be.fulfilledWith(batch)
      })
    })

    describe('#pop()', () => {
      it('successively resolves with each Batch in insertion order', async () => {
        const batch1 = builders.nonEmptyBatch(1)
        const batch2 = builders.nonEmptyBatch(2)

        channel.push(batch1)
        channel.push(batch2)

        await should(channel.pop()).be.fulfilledWith(batch1)
        await should(channel.pop()).be.fulfilledWith(batch2)
      })

      describe('when all Batches were already popped', () => {
        beforeEach('push and pop', async () => {
          channel.push(builders.nonEmptyBatch(1))
          await channel.pop()
        })

        it('awaits for the next Batch', async () => {
          const batch2 = builders.nonEmptyBatch(2)

          const nextBatchPromise = channel.pop()
          channel.push(batch2)

          await should(nextBatchPromise).be.fulfilledWith(batch2)
        })
      })

      describe('when Channel was never pushed anything', () => {
        it('awaits for the next Batch', async () => {
          const batch1 = builders.nonEmptyBatch(1)
          const batch2 = builders.nonEmptyBatch(2)

          const nextBatchPromise = channel.pop()
          channel.push(batch1)
          channel.push(batch2)

          await should(nextBatchPromise).be.fulfilledWith(batch1)
        })
      })

      describe('when called more than once on an empty Channel (DO NOT DO THIS)', () => {
        it('only resolves the last Promise with the next Batch', async () => {
          const batch1 = builders.nonEmptyBatch(1)
          const batch2 = builders.nonEmptyBatch(2)

          const popPromise1 = channel.pop()
          const popPromise2 = channel.pop()
          channel.push(batch1)
          channel.push(batch2)

          await should(popPromise2).be.fulfilledWith(batch1)
          should(popPromise1).be.pending()
        })
      })
    })
  })

  describe('Plugging', () => {
    /**
     * Channel#map() and #asyncMap() basically plug two Channels together with a
     * transformation. One may carry out the following steps:
     *
     * - Call #push() on the input Channel with a Batch to transform.
     * - Call #map() or #asyncMap() on the input Channel and get an output
     *   Channel.
     * - Call #pop() on the output Channel to asynchronously retrieve the next
     *   transformed Batch.
     *
     * The order by which steps occur shouldn't matter, except:
     *
     * - #map() or #asyncMap() must be called only once.
     * - #map() or #asyncMap() must be called before any #pop(), otherwise we
     *   don't have any output Channel to *pop* from.
     * - A #pop() cannot occur without awaiting a previous #pop() due to the
     *   way Channels are currently implemented.
     *
     * Many scenarios are tested below to make sure the expected properties
     * are enforced for all of them.
     */

    /** SCENARIOS
     *
     * Scenarios are currently defined as a self-describing string, e.g.
     * 'push map pop' or 'asyncMap pop push push pop'.
     */

    const scenarioDescription = _.identity
    const scenarioSteps = scenario => scenario.split(' ')

    /** STEPS IMPLEMENTATION
     *
     * Steps are defined as simple words (with corresponding implementation
     * functions).
     *
     * This basically means calling the right method on the right channel
     * given the current state of the scenario:
     */

    const map = scenarioState => {
      const { inputChannel, callback } = scenarioState
      scenarioState.outputChannel = inputChannel.map(callback)
    }

    const asyncMap = scenarioState => {
      const { inputChannel, callback } = scenarioState
      scenarioState.outputChannel = inputChannel.asyncMap(callback)
    }

    const push = ({ inputChannel, inputBatches }) => {
      const nextBatchNumber = inputBatches.length + 1
      const newBatch = builders.nonEmptyBatch(nextBatchNumber)
      inputBatches.push(newBatch)
      inputChannel.push(newBatch)
    }

    const pop = scenarioState => {
      const { outputChannel, outputBatchesPromise } = scenarioState
      if (!outputChannel) {
        throw new Error(`Step pop cannot occur before asyncMap in scenario`)
      }
      scenarioState.outputBatchesPromise = outputBatchesPromise
        .then(outputBatches =>
          Promise.all([outputBatches, outputChannel.pop()])
        )
        .then(([outputBatches, batch]) => outputBatches.concat([batch]))
    }

    const scenarioStepFn = step => {
      switch (step) {
        case 'map':
          return map
        case 'asyncMap':
          return asyncMap
        case 'push':
          return push
        case 'pop':
          return pop
        default:
          throw new Error(`Unknown scenario step: ${step}`)
      }
    }

    /** TRANSFORMS
     *
     * The transformation that will be applied to each Batch.
     *
     * Must be sync from #map() and async for #asyncMap().
     */

    const transform = batch =>
      batch.map(event => _.defaults({ path: `mapped-${event.path}` }, event))

    const asyncTransform = async batch => {
      // According to manual testing, random 1-5ms delay easily breaks tests
      // in case Channel#asyncMap() doesn't properly await asyncTransform()
      // while keeping the test suite duration < 2x the time without delay.
      await Promise.delay(_.random(5))
      return transform(batch)
    }

    /** OPERATIONS */

    describe('#map()', () => {
      const scenarios = [
        'map',
        'map push pop',
        'map pop push',
        'map push push pop pop',
        'map push pop push pop',
        'map pop push pop push',
        'map pop push push pop',
        'push map pop',
        'push map pop push pop',
        'push map push pop pop',
        'push push map pop pop'
      ]

      /** MOCHA SETUP */

      for (const scenario of scenarios) {
        describe(scenarioDescription(scenario), () => {
          let scenarioState /*:: ?: {
            callback: (ChannelBatch) => ChannelBatch,
            inputBatches: ChannelBatch[],
            inputChannel: Channel,
            outputChannel?: Channel,
            outputBatchesPromise: Promise<ChannelBatch[]>
          } */

          beforeEach('init scenarioState', () => {
            scenarioState = {
              callback: sinon.spy(transform),
              inputBatches: [],
              inputChannel: new Channel(),
              outputBatchesPromise: Promise.resolve([])
            }
          })

          for (const step of scenarioSteps(scenario)) {
            beforeEach(step, () => {
              // Make sure we don't return a Promise to mocha so scenarios may
              // reproduce async edge cases.
              scenarioStepFn(step)(scenarioState)
            })
          }

          beforeEach('await output', () => scenarioState.outputBatchesPromise)

          /** EXPECTATIONS */

          it('returns a new output Channel', () => {
            const { inputChannel, outputChannel } = scenarioState
            should(outputChannel)
              .be.an.instanceOf(Channel)
              .not.equal(inputChannel)
          })

          it('invokes callback with each input Batch in order if any', () => {
            const { callback, inputBatches } = scenarioState
            const passedBatches = callback.args.map(args => args[0])
            should(passedBatches).deepEqual(inputBatches)
          })

          it('pushes each transformed Batch if any to the output Channel in order', async () => {
            const { inputBatches, outputBatchesPromise } = scenarioState
            const expectedOutputBatches = await Promise.map(
              inputBatches,
              asyncTransform
            )
            const actualOutputBatches = await outputBatchesPromise
            should(expectedOutputBatches).deepEqual(actualOutputBatches)
          })
        })
      }
    })

    describe('#asyncMap()', () => {
      const scenarios = [
        'asyncMap',
        'asyncMap push pop',
        'asyncMap pop push',
        'asyncMap push push pop pop',
        'asyncMap push pop push pop',
        'asyncMap pop push pop push',
        'asyncMap pop push push pop',
        'push asyncMap pop',
        'push asyncMap pop push pop',
        'push asyncMap push pop pop',
        'push push asyncMap pop pop'
      ]

      /** MOCHA SETUP */

      for (const scenario of scenarios) {
        describe(scenarioDescription(scenario), () => {
          let scenarioState /*:: ?: {
            callback: (ChannelBatch) => Promise<ChannelBatch>,
            inputBatches: ChannelBatch[],
            inputChannel: Channel,
            outputChannel?: Channel,
            outputBatchesPromise: Promise<ChannelBatch[]>
          } */

          beforeEach('init scenarioState', () => {
            scenarioState = {
              callback: sinon.spy(asyncTransform),
              inputBatches: [],
              inputChannel: new Channel(),
              outputBatchesPromise: Promise.resolve([])
            }
          })

          for (const step of scenarioSteps(scenario)) {
            beforeEach(step, () => {
              // Make sure we don't return a Promise to mocha so scenarios may
              // reproduce async edge cases.
              scenarioStepFn(step)(scenarioState)
            })
          }

          beforeEach('await output', () => scenarioState.outputBatchesPromise)

          /** EXPECTATIONS */

          it('returns a new output Channel', () => {
            const { inputChannel, outputChannel } = scenarioState
            should(outputChannel)
              .be.an.instanceOf(Channel)
              .not.equal(inputChannel)
          })

          it('invokes callback with each input Batch in order if any', () => {
            const { callback, inputBatches } = scenarioState
            const passedBatches = callback.args.map(args => args[0])
            should(passedBatches).deepEqual(inputBatches)
          })

          it('pushes each transformed Batch if any to the output Channel in order', async () => {
            const { inputBatches, outputBatchesPromise } = scenarioState
            const expectedOutputBatches = await Promise.map(
              inputBatches,
              asyncTransform
            )
            const actualOutputBatches = await outputBatchesPromise
            should(expectedOutputBatches).deepEqual(actualOutputBatches)
          })
        })
      }
    })
  })
})

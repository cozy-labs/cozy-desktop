/* eslint-env mocha */
/* @flow */

const Promise = require('bluebird')
const _ = require('lodash')
const should = require('should')
const sinon = require('sinon')

const Buffer = require('../../../../core/local/steps/buffer')

const Builders = require('../../../support/builders')

/*::
import type {
  AtomWatcherEvent,
  Batch
} from '../../../../core/local/steps/event'
*/

const builders = new Builders()

describe('core/local/steps/Buffer', function () {
  this.timeout(100)

  describe('Basics', () => {
    let buffer

    beforeEach('instanciate', () => {
      buffer = new Buffer()
    })

    describe('#push()', () => {
      it('inserts the given Batch into the Buffer so it may be retrieved with #pop()', async () => {
        const batch = builders.nonEmptyBatch()

        buffer.push(batch)

        await should(buffer.pop()).be.fulfilledWith(batch)
      })

      it('does not squash equivalent batches', async () => {
        const batch = builders.nonEmptyBatch()

        buffer.push(batch)
        buffer.push(batch)

        await should(buffer.pop()).be.fulfilledWith(batch)
        await should(buffer.pop()).be.fulfilledWith(batch)
      })

      it('accepts empty batches', async () => {
        const batch = []

        buffer.push(batch)

        await should(buffer.pop()).be.fulfilledWith(batch)
      })
    })

    describe('#pop()', () => {
      it('successively resolves with each Batch in insertion order', async () => {
        const batch1 = builders.nonEmptyBatch(1)
        const batch2 = builders.nonEmptyBatch(2)

        buffer.push(batch1)
        buffer.push(batch2)

        await should(buffer.pop()).be.fulfilledWith(batch1)
        await should(buffer.pop()).be.fulfilledWith(batch2)
      })

      describe('when all Batches were already popped', () => {
        beforeEach('push and pop', async () => {
          buffer.push(builders.nonEmptyBatch(1))
          await buffer.pop()
        })

        it('awaits for the next Batch', async () => {
          const batch2 = builders.nonEmptyBatch(2)

          const nextBatchPromise = buffer.pop()
          buffer.push(batch2)

          await should(nextBatchPromise).be.fulfilledWith(batch2)
        })
      })

      describe('when Buffer was never pushed anything', () => {
        it('awaits for the next Batch', async () => {
          const batch1 = builders.nonEmptyBatch(1)
          const batch2 = builders.nonEmptyBatch(2)

          const nextBatchPromise = buffer.pop()
          buffer.push(batch1)
          buffer.push(batch2)

          await should(nextBatchPromise).be.fulfilledWith(batch1)
        })
      })

      describe('when called more than once on an empty Buffer (DO NOT DO THIS)', () => {
        it('only resolves the last Promise with the next Batch', async () => {
          const batch1 = builders.nonEmptyBatch(1)
          const batch2 = builders.nonEmptyBatch(2)

          const popPromise1 = buffer.pop()
          const popPromise2 = buffer.pop()
          buffer.push(batch1)
          buffer.push(batch2)

          await should(popPromise2).be.fulfilledWith(batch1)
          should(popPromise1).be.pending()
        })
      })
    })
  })

  describe('Plugging', () => {
    /**
     * Buffer#map() and #asyncMap() basically plug two Buffers together with a
     * transformation. One may carry out the following steps:
     *
     * - Call #push() on the input Buffer with a Batch to transform.
     * - Call #map() or #asyncMap() on the input Buffer and get an output
     *   Buffer.
     * - Call #pop() on the output Buffer to asynchronously retrieve the next
     *   transformed Batch.
     *
     * The order by which steps occur shouldn't matter, except:
     *
     * - #map() or #asyncMap() must be called only once.
     * - #map() or #asyncMap() must be called before any #pop(), otherwise we
     *   don't have any output Buffer to *pop* from.
     * - A #pop() cannot occur without awaiting a previous #pop() due to the
     *   way Buffers are currently implemented.
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
     * This basically means calling the right method on the right buffer
     * given the current state of the scenario:
     */

    const map = scenarioState => {
      const { inputBuffer, callback } = scenarioState
      scenarioState.outputBuffer = inputBuffer.map(callback)
    }

    const asyncMap = scenarioState => {
      const { inputBuffer, callback } = scenarioState
      scenarioState.outputBuffer = inputBuffer.asyncMap(callback)
    }

    const push = ({ inputBuffer, inputBatches }) => {
      const nextBatchNumber = inputBatches.length + 1
      const newBatch = builders.nonEmptyBatch(nextBatchNumber)
      inputBatches.push(newBatch)
      inputBuffer.push(newBatch)
    }

    const pop = (scenarioState) => {
      const { outputBuffer, outputBatchesPromise } = scenarioState
      if (!outputBuffer) {
        throw new Error(`Step pop cannot occur before asyncMap in scenario`)
      }
      scenarioState.outputBatchesPromise = new Promise((resolve, reject) => {
        outputBatchesPromise
          .then(outputBatches =>
            outputBuffer.pop().then(batch =>
              resolve(outputBatches.concat([batch]))
            )
          )
          .catch(reject)
      })
    }

    const scenarioStepFn = step => {
      switch (step) {
        case 'map': return map
        case 'asyncMap': return asyncMap
        case 'push': return push
        case 'pop': return pop
        default: throw new Error(`Unknown scenario step: ${step}`)
      }
    }

    /** TRANSFORMS
     *
     * The transformation that will be applied to each Batch.
     *
     * Must be sync from #map() and async for #asyncMap().
     */

    const transform = batch => (
      batch.map(event =>
        _.defaults(
          {path: `mapped-${event.path}`},
          event
        )
      )
    )

    const asyncTransform = async batch => {
      // According to manual testing, random 1-5ms delay easily breaks tests
      // in case Buffer#asyncMap() doesn't properly await asyncTransform()
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
            callback: (Batch) => Batch,
            inputBatches: Batch[],
            inputBuffer: Buffer,
            outputBuffer?: Buffer,
            outputBatchesPromise: Promise<Batch[]>
          } */

          beforeEach('init scenarioState', () => {
            scenarioState = {
              callback: sinon.spy(transform),
              inputBatches: [],
              inputBuffer: new Buffer(),
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

          it('returns a new output Buffer', () => {
            const { inputBuffer, outputBuffer } = scenarioState
            should(outputBuffer).be.an.instanceOf(Buffer).not.equal(inputBuffer)
          })

          it('invokes callback with each input Batch in order if any', () => {
            const { callback, inputBatches } = scenarioState
            const passedBatches = callback.args.map(args => args[0])
            should(passedBatches).deepEqual(inputBatches)
          })

          it('pushes each transformed Batch if any to the output Buffer in order', async () => {
            const { inputBatches, outputBatchesPromise } = scenarioState
            const expectedOutputBatches = await Promise.map(inputBatches, asyncTransform)
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
            callback: (Batch) => Promise<Batch>,
            inputBatches: Batch[],
            inputBuffer: Buffer,
            outputBuffer?: Buffer,
            outputBatchesPromise: Promise<Batch[]>
          } */

          beforeEach('init scenarioState', () => {
            scenarioState = {
              callback: sinon.spy(asyncTransform),
              inputBatches: [],
              inputBuffer: new Buffer(),
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

          it('returns a new output Buffer', () => {
            const { inputBuffer, outputBuffer } = scenarioState
            should(outputBuffer).be.an.instanceOf(Buffer).not.equal(inputBuffer)
          })

          it('invokes callback with each input Batch in order if any', () => {
            const { callback, inputBatches } = scenarioState
            const passedBatches = callback.args.map(args => args[0])
            should(passedBatches).deepEqual(inputBatches)
          })

          it('pushes each transformed Batch if any to the output Buffer in order', async () => {
            const { inputBatches, outputBatchesPromise } = scenarioState
            const expectedOutputBatches = await Promise.map(inputBatches, asyncTransform)
            const actualOutputBatches = await outputBatchesPromise
            should(expectedOutputBatches).deepEqual(actualOutputBatches)
          })
        })
      }
    })
  })
})

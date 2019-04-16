/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const should = require('should')

const awaitWriteFinish = require('../../../../core/local/steps/await_write_finish')
const Buffer = require('../../../../core/local/steps/buffer')
const stater = require('../../../../core/local/stater')

const lastEventToCheckEmptyness = {
  action: 'initial-scan-done',
  kind: 'unknown',
  path: ''
}

async function heuristicIsEmpty (buffer) {
  const expected = await buffer.pop()
  return (
    (expected.length === 1 &&
      Object.keys(expected[0]).reduce(
        (acc, prop) =>
          acc && expected[0][prop] === lastEventToCheckEmptyness[prop],
        true
      )) ||
    console.log(expected)
  )
}

describe('core/local/steps/await_write_finish.loop()', () => {
  context('with many batches', () => {
    it('should reduce created→deleted to empty', async () => {
      const buffer = new Buffer()
      const originalBatch = [
        {
          action: 'created',
          kind: 'file',
          path: __filename
        },
        {
          action: 'deleted',
          kind: 'file',
          path: __filename
        },
        lastEventToCheckEmptyness
      ]
      originalBatch.forEach(event => {
        buffer.push([Object.assign({}, event)])
      })
      const enhancedBuffer = awaitWriteFinish.loop(buffer, {})
      should(await heuristicIsEmpty(enhancedBuffer)).be.true()
    })

    it('should reduce modified→deleted to deleted', async () => {
      const buffer = new Buffer()
      const originalBatch = [
        {
          action: 'modified',
          kind: 'file',
          path: __filename
        },
        {
          action: 'deleted',
          kind: 'file',
          path: __filename
        },
        lastEventToCheckEmptyness
      ]
      originalBatch.forEach(event => {
        buffer.push([Object.assign({}, event)])
      })
      const enhancedBuffer = awaitWriteFinish.loop(buffer, {})
      should(await enhancedBuffer.pop()).eql([
        originalBatch[1]
      ])
      should(await heuristicIsEmpty(enhancedBuffer)).be.true()
    })

    describe('created→modified→modified with or without deleted', () => {
      it('should reduce created→modified→modified to created', async () => {
        const buffer = new Buffer()
        const originalBatch = [
          {
            action: 'created',
            kind: 'file',
            path: __filename
          },
          {
            action: 'modified',
            kind: 'file',
            path: __filename
          },
          {
            action: 'modified',
            kind: 'file',
            path: __filename
          },
          lastEventToCheckEmptyness
        ]
        originalBatch.forEach(event => {
          buffer.push([Object.assign({}, event)])
        })
        const enhancedBuffer = awaitWriteFinish.loop(buffer, {})
        should(await enhancedBuffer.pop()).eql([
          {
            // 3rd modified -> created
            action: 'created',
            awaitWriteFinish: {
              previousEvents: [
                {
                  // 2nd modified -> created
                  action: 'created',
                  awaitWriteFinish: {
                    previousEvents: [
                      {
                        // 1st created
                        action: 'created',
                        kind: 'file',
                        path: __filename
                      }
                    ]
                  },
                  kind: 'file',
                  path: __filename
                }
              ]
            },
            kind: 'file',
            path: __filename
          }
        ])
        should(await heuristicIsEmpty(enhancedBuffer)).be.true()
      })

      it('should reduce created→modified→modified→deleted to empty', async () => {
        const buffer = new Buffer()
        const originalBatch = [
          {
            action: 'created',
            kind: 'file',
            path: __filename
          },
          {
            action: 'modified',
            kind: 'file',
            path: __filename
          },
          {
            action: 'modified',
            kind: 'file',
            path: __filename
          },
          {
            action: 'deleted',
            kind: 'file',
            path: __filename
          },
          lastEventToCheckEmptyness
        ]
        originalBatch.forEach(event => {
          buffer.push([Object.assign({}, event)])
        })
        const enhancedBuffer = awaitWriteFinish.loop(buffer, {})
        should(await heuristicIsEmpty(enhancedBuffer)).be.true()
      })
    })

    it('should reduce modified→modified to latest modified', async () => {
      const fileStats = await stater.stat(__filename)
      const stats1 = {
        ...fileStats,
        size: 1
      }
      const stats2 = {
        ...fileStats,
        size: 2
      }
      const buffer = new Buffer()
      const originalBatch = [
        {
          action: 'modified',
          kind: 'file',
          path: __filename,
          stats: stats1
        },
        {
          action: 'modified',
          kind: 'file',
          path: __filename,
          stats: stats2
        },
        lastEventToCheckEmptyness
      ]
      originalBatch.forEach(event => {
        buffer.push([Object.assign({}, event)])
      })
      const enhancedBuffer = awaitWriteFinish.loop(buffer, {})
      should(await enhancedBuffer.pop()).eql([
        {
          action: 'modified',
          awaitWriteFinish: {
            previousEvents: [
              {
                action: 'modified',
                kind: 'file',
                path: __filename,
                stats: stats1
              }
            ]
          },
          kind: 'file',
          path: __filename,
          stats: stats2
        }
      ])
      should(await heuristicIsEmpty(enhancedBuffer)).be.true()
    })

    it('should not squash incomplete events', async () => {
      const buffer = new Buffer()
      const originalBatch = [
        {
          action: 'created',
          kind: 'file',
          path: __filename
        },
        {
          action: 'modified',
          kind: 'file',
          path: __filename,
          incomplete: true
        },
        {
          action: 'modified',
          kind: 'file',
          path: __filename
        },
        lastEventToCheckEmptyness
      ]
      originalBatch.forEach(event => {
        buffer.push([Object.assign({}, event)])
      })
      const enhancedBuffer = awaitWriteFinish.loop(buffer, {})
      should(await enhancedBuffer.pop()).eql([originalBatch[1]])
      should(await enhancedBuffer.pop()).eql([
        {
          // 3rd modified -> created
          action: 'created',
          awaitWriteFinish: {
            previousEvents: [
              {
                // 1st created -> created
                action: 'created',
                kind: 'file',
                path: __filename
              }
            ]
          },
          kind: 'file',
          path: __filename
        }
      ])
      should(await heuristicIsEmpty(enhancedBuffer)).be.true()
    })
  })

  context('with one batch', () => {
    it('should reduce created→deleted to empty', async () => {
      const buffer = new Buffer()
      const originalBatch = [
        {
          action: 'created',
          kind: 'file',
          path: __filename
        },
        {
          action: 'deleted',
          kind: 'file',
          path: __filename
        },
        lastEventToCheckEmptyness
      ]
      buffer.push(_.cloneDeep(originalBatch))
      const enhancedBuffer = awaitWriteFinish.loop(buffer, {})
      should(await enhancedBuffer.pop()).eql([
        lastEventToCheckEmptyness
      ])
    })

    it('should reduce modified→deleted to deleted', async () => {
      const buffer = new Buffer()
      const originalBatch = [
        {
          action: 'modified',
          kind: 'file',
          path: __filename
        },
        {
          action: 'deleted',
          kind: 'file',
          path: __filename
        },
        lastEventToCheckEmptyness
      ]
      buffer.push(_.cloneDeep(originalBatch))
      const enhancedBuffer = awaitWriteFinish.loop(buffer, {})
      should(await enhancedBuffer.pop()).eql([
        originalBatch[1],
        lastEventToCheckEmptyness
      ])
    })

    describe('created→modified→modified with or without deleted', () => {
      it('should reduce created→modified→modified to created', async () => {
        const buffer = new Buffer()
        const originalBatch = [
          {
            action: 'created',
            kind: 'file',
            path: __filename
          },
          {
            action: 'modified',
            kind: 'file',
            path: __filename
          },
          {
            action: 'modified',
            kind: 'file',
            path: __filename
          },
          lastEventToCheckEmptyness
        ]
        buffer.push(_.cloneDeep(originalBatch))
        const enhancedBuffer = awaitWriteFinish.loop(buffer, {})
        should(await enhancedBuffer.pop()).eql([
          {
            // 3rd modified -> created
            action: 'created',
            awaitWriteFinish: {
              previousEvents: [
                {
                  // 2nd modified -> created
                  action: 'created',
                  awaitWriteFinish: {
                    previousEvents: [
                      {
                        // 1st created
                        action: 'created',
                        kind: 'file',
                        path: __filename
                      }
                    ]
                  },
                  kind: 'file',
                  path: __filename
                }
              ]
            },
            kind: 'file',
            path: __filename
          },
          lastEventToCheckEmptyness
        ])
      })

      it('should reduce created→modified→modified→deleted to empty', async () => {
        const buffer = new Buffer()
        const originalBatch = [
          {
            action: 'created',
            kind: 'file',
            path: __filename
          },
          {
            action: 'modified',
            kind: 'file',
            path: __filename
          },
          {
            action: 'modified',
            kind: 'file',
            path: __filename
          },
          {
            action: 'deleted',
            kind: 'file',
            path: __filename
          },
          lastEventToCheckEmptyness
        ]
        buffer.push(_.cloneDeep(originalBatch))
        const enhancedBuffer = awaitWriteFinish.loop(buffer, {})
        should(await enhancedBuffer.pop()).eql([
          lastEventToCheckEmptyness
        ])
      })
    })

    it('should reduce modified→modified to latest modified', async () => {
      const fileStats = await stater.stat(__filename)
      const stats1 = {
        ...fileStats,
        size: 1
      }
      const stats2 = {
        ...fileStats,
        size: 2
      }
      const buffer = new Buffer()
      const originalBatch = [
        {
          action: 'modified',
          kind: 'file',
          path: __filename,
          stats: stats1
        },
        {
          action: 'modified',
          kind: 'file',
          path: __filename,
          stats: stats2
        },
        lastEventToCheckEmptyness
      ]
      buffer.push(_.cloneDeep(originalBatch))
      const enhancedBuffer = awaitWriteFinish.loop(buffer, {})
      should(await enhancedBuffer.pop()).eql([
        {
          action: 'modified',
          awaitWriteFinish: {
            previousEvents: [
              {
                action: 'modified',
                kind: 'file',
                path: __filename,
                stats: stats1
              }
            ]
          },
          kind: 'file',
          path: __filename,
          stats: stats2
        },
        lastEventToCheckEmptyness
      ])
    })

    it('should not squash incomplete events', async () => {
      const buffer = new Buffer()
      const originalBatch = [
        {
          action: 'created',
          kind: 'file',
          path: __filename
        },
        {
          action: 'modified',
          kind: 'file',
          path: __filename,
          incomplete: true
        },
        {
          action: 'modified',
          kind: 'file',
          path: __filename
        },
        lastEventToCheckEmptyness
      ]
      buffer.push(_.cloneDeep(originalBatch))
      const enhancedBuffer = awaitWriteFinish.loop(buffer, {})
      should(await enhancedBuffer.pop()).eql([
        {
          // 3rd modified -> created
          action: 'created',
          awaitWriteFinish: {
            previousEvents: [
              {
                // 1st created
                action: 'created',
                kind: 'file',
                path: __filename
              }
            ]
          },
          kind: 'file',
          path: __filename
        },
        originalBatch[1],
        lastEventToCheckEmptyness
      ])
    })
  })
})

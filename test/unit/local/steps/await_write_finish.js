/* eslint-env mocha */
/* @flow */

const should = require('should')
const { step: awaitWriteFinish } = require('../../../../core/local/steps/await_write_finish')
const Buffer = require('../../../../core/local/steps/buffer')

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

describe('core/local/steps/await_write_finish', () => {
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
    const enhancedBuffer = awaitWriteFinish(buffer, {})
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
      const enhancedBuffer = awaitWriteFinish(buffer, {})
      should(await enhancedBuffer.pop()).eql([originalBatch[0]])
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
      const enhancedBuffer = awaitWriteFinish(buffer, {})
      should(await heuristicIsEmpty(enhancedBuffer)).be.true()
    })
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
    const enhancedBuffer = awaitWriteFinish(buffer, {})
    should(await enhancedBuffer.pop()).eql([originalBatch[1]])
    should(await enhancedBuffer.pop()).eql([originalBatch[0]])
    should(await heuristicIsEmpty(enhancedBuffer)).be.true()
  })
})

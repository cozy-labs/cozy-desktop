/* @flow */

const { map } = require('./utils')

module.exports = async function* (generator /*: AsyncGenerator<*, void, void> */, opts /*: {} */) /*: AsyncGenerator<*, void, void> */ {
  return map(generator, (batch) => {
    console.log('initial_diff', batch.length)
    return batch
  })
}

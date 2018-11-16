/* @flow */

module.exports = async function* (generator /*: AsyncGenerator<*, void, void> */, opts /*: {} */) /*: AsyncGenerator<*, void, void> */ {
  for await (const batch of generator) {
    console.log('initial_diff', batch.length)
    yield batch
  }
}

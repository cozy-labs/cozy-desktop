/* @flow */

module.exports = async function* (generator) {
  for await (const batch of generator) {
    console.log('initial_diff', batch.length)
    yield batch
  }
}

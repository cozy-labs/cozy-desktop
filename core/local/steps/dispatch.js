/* @flow */

module.exports = async function (generator /*: AsyncGenerator<*, void, void> */, opts /*: {} */) {
  for await (const batch of generator) {
    console.log('dispatch', batch)
  }
}

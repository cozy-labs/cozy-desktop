/* @flow */

module.exports = async function (generator) {
  for await (const batch of generator) {
    console.log('dispatch', batch)
  }
}

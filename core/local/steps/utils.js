module.exports = {
  map: async function* (generator, fn) {
    for await (let batch of generator) {
      batch = fn(batch)
      if (batch.length > 0) {
        yield batch
      }
    }
  },

  asyncMap: async function* (generator, fn) {
    for await (let batch of generator) {
      batch = await fn(batch)
      if (batch.length > 0) {
        yield batch
      }
    }
  }
}

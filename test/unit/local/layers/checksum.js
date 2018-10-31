/* eslint-env mocha */

const { random } = require('faker')
const should = require('should')

const Layer = require('../../../../core/local/layers/checksum')

class LayerRecorder {
  constructor () { this.calls = [] }
  async initial () { this.calls.push('initial') }
  async process (events) { this.calls.push(events) }
}

describe('ChecksumLayer', function () {
  it('preserve order of batches', async function () {
    const next = new LayerRecorder()
    const checksumer = {
      push: async (path) => {
        await Promise.delay(random.number(4))
        return path
      }
    }
    const layer = new Layer(next, checksumer)

    const buildBatches = (k) => {
      const batches = []
      let n = k + random.number(10)
      for (let i = 0; i < n; i++) {
        const batch = []
        const l = 1 + random.number(3)
        for (let j = 0; j < l; j++) {
          const event = {
            action: random.arrayElement(['add', 'update', 'remove', 'move']),
            docType: 'file',
            doc: { path: i + '-' + j + '-' + l }
          }
          batch.push(event)
        }
        batches.push(batch)
      }
      return batches
    }

    const initBatches = buildBatches(0)
    const laterBatches = buildBatches(1)

    for (const batch of initBatches) {
      layer.process(batch)
      await Promise.delay(Math.random() * 3)
    }
    layer.initial()
    let last
    for (const batch of laterBatches) {
      await Promise.delay(Math.random() * 8)
      last = layer.process(batch)
    }
    await last

    const expected = []
    const addExpectations = (batches) => {
      for (const batch of batches) {
        const events = []
        for (let event of batch) {
          doc = { ...event.doc }
          if (event.action === 'add' || event.action === 'update') {
            doc.checksum = doc.path
          }
          events.push({ ...event, doc })
        }
        expected.push(events)
      }
    }
    addExpectations(initBatches)
    expected.push('initial')
    addExpectations(laterBatches)

    should(next.calls).deepEqual(expected)
  })
})

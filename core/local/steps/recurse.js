/* @flow */

/*::
import type Buffer from './buffer'
import type LinuxProducer from './linux_producer'

export interface Adder {
  add(string): Promise<*>,
}
*/

module.exports = function (buffer /*: Buffer */, opts /*: { adder: Adder } */) /*: Buffer */ {
  return buffer.asyncMap(async (batch) => {
    for (const event of batch) {
      if (event.docType === 'directory' && event.action === 'created') {
        try {
          await opts.adder.add(event.path)
        } catch (err) {
          console.log('recurse', err) // TODO error handling
        }
      }
    }
    return batch
  })
}

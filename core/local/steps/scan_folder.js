/* @flow */

const logger = require('../../logger')
const log = logger({
  component: 'scanFolder'
})

/*::
import type Buffer from './buffer'
import type { Producer } from './producer'
*/

// This step
module.exports = function (buffer /*: Buffer */, opts /*: { producer: Producer } */) /*: Buffer */ {
  return buffer.asyncMap(async (batch) => {
    for (const event of batch) {
      if (event.action === 'created' && event.docType === 'directory') {
        opts.producer.scan(event.path)
          .catch((err) => log.info({err, event}, 'Error on scan'))
      }
    }
    return batch
  })
}

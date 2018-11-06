/* @flow */

const { assignId } = require('../../metadata')

/*::
import type { Layer, LayerEvent } from './events'
*/

// Identifier just adds IDs to the documents in the events.
// TODO call metadata.assignPlatformIncompatibilities from here?
module.exports = class Identifier {
  /*::
  next: Layer
  */

  constructor (next /*: Layer */) {
    this.next = next
  }

  initial () {
    return this.next.initial()
  }

  process (events /*: LayerEvent[] */) {
    for (const event of events) {
      if (event.doc) {
        assignId(event.doc)
      }
      if (event.action === 'move') {
        assignId(event.src)
      }
    }
    return this.next.process(events)
  }
}

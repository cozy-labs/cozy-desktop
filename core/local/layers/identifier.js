/* @flow */

const { assignId } = require('../../metadata')

/*::
import type { Layer } from './events'
*/

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

  async process (events /*: Array<*> */) {
    for (const event of events) {
      if (event.doc) {
        assignId(event.doc)
      }
      if (event.was) {
        assignId(event.was)
      }
    }
    return this.next.process(events)
  }
}

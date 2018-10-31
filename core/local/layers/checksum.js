/* @flow */

/*::
import type { Checksumer } from '../checksumer'
import type { Layer } from './events'
*/

module.exports = class ChecksumLayer {
  /*::
  next: Layer
  task : Promise<*>
  checksumer: Checksumer
  */

  constructor (next /*: Layer */, checksumer /*: Checksumer */) {
    this.next = next
    this.task = Promise.resolve()
    this.checksumer = checksumer
  }

  async initial () {
    let result
    const task = this.task
    this.task = new Promise(async (resolve) => {
      await task
      result = this.next.initial()
      resolve()
    })
    await this.task
    return result
  }

  async process (events /*: Array<*> */) {
    let result
    const task = this.task
    this.task = new Promise(async (resolve) => {
      await task
      events = await this.doProcess(events)
      result = this.next.process(events)
      resolve()
    })
    await this.task
    return result
  }

  async doProcess (events /*: Array<*> */) {
    for (const event of events) {
      if (event.docType === 'file' && ['add', 'update'].includes(event.action)) {
        try {
          event.doc.checksum = await this.checksumer.push(event.doc.path)
        } catch (err) {
          // TODO
          console.error(err)
        }
      }
    }
    return events
  }
}

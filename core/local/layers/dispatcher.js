/* @flow */

/*::
import type Pouch from '../../pouch'
import type Prep from '../../prep'
import type { FullEvent } from './events'
import type EventEmitter from 'events'
*/

const SIDE = 'local'

module.exports = class Dispatcher {
  /*::
  target: Prep
  pouch: Pouch
  events: EventEmitter
  */

  constructor (target /*: Prep */, pouch /*: Pouch */, events /*: EventEmitter */) {
    this.target = target
    this.pouch = pouch
    this.events = events
  }

  async process (events /*: FullEvent[] */) {
    // TODO we should not start processing a batch of events before the previous one has finished
    for (const event of events) {
      // $FlowFixMe
      await this[event.action + event.doc.docType](event)
    }
  }

  async initial () {
    // TODO wait that the batches of events are finished
    // TODO initial diff
    // TODO emit ready after initial scan
  }

  // TODO Fetch old docs from pouch

  async addfile (event /*: FullEvent */) {
    await this.target.addFileAsync(SIDE, event.doc)
  }

  async movefile (event /*: FullEvent */) {
    await this.target.moveFileAsync(SIDE, event.doc, event.src)
  }

  async updatefile (event /*: FullEvent */) {
    await this.target.updateFileAsync(SIDE, event.doc)
  }

  async removefile (event /*: FullEvent */) {
    await this.target.trashFileAsync(SIDE, event.doc)
  }

  async addfolder (event /*: FullEvent */) {
    await this.target.putFolderAsync(SIDE, event.doc)
  }

  async movefolder (event /*: FullEvent */) {
    await this.target.moveFolderAsync(SIDE, event.doc, event.src)
  }

  async updatefolder (event /*: FullEvent */) {
    await this.target.putFolderAsync(SIDE, event.doc)
  }

  async removefolder (event /*: FullEvent */) {
    await this.target.trashFolderAsync(SIDE, event.doc)
  }
}

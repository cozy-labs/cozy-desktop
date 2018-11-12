/* @flow */

/*::
import type Pouch from '../../pouch'
import type Prep from '../../prep'
import type { Layer, LayerEvent, LayerAddEvent, LayerUpdateEvent, LayerMoveEvent, LayerRemoveEvent } from './events'
import type EventEmitter from 'events'
*/

const SIDE = 'local'

module.exports = class Dispatcher /*:: implements Layer */ {
  /*::
  target: Prep
  pouch: Pouch
  events: EventEmitter
  task : Promise<*>
  */

  constructor (target /*: Prep */, pouch /*: Pouch */, events /*: EventEmitter */) {
    this.target = target
    this.pouch = pouch
    this.events = events
    this.task = Promise.resolve()
  }

  async initial () {
    const task = this.task
    this.task = new Promise(async (resolve) => {
      await task
      // TODO initial diff
      this.events.emit('initial-scan-done')
      resolve()
    })
    return this.task
  }

  async process (events /*: LayerEvent[] */) {
    const task = this.task
    this.task = new Promise(async (resolve) => {
      await task
      for (const event of events) {
        try {
          // $FlowFixMe
          await this[event.action + event.doc.docType](event)
        } catch (err) {
          console.log('Dispatch.process error:', err) // TODO
        }
      }
      resolve()
    })
    return this.task
  }

  // TODO Fetch old docs from pouch

  async addfile (event /*: LayerAddEvent */) {
    await this.target.addFileAsync(SIDE, event.doc)
  }

  async movefile (event /*: LayerMoveEvent */) {
    await this.target.moveFileAsync(SIDE, event.doc, event.src)
  }

  async updatefile (event /*: LayerUpdateEvent */) {
    await this.target.updateFileAsync(SIDE, event.doc)
  }

  async removefile (event /*: LayerRemoveEvent */) {
    await this.target.trashFileAsync(SIDE, event.doc)
  }

  async addfolder (event /*: LayerAddEvent */) {
    await this.target.putFolderAsync(SIDE, event.doc)
  }

  async movefolder (event /*: LayerMoveEvent */) {
    await this.target.moveFolderAsync(SIDE, event.doc, event.src)
  }

  async updatefolder (event /*: LayerUpdateEvent */) {
    await this.target.putFolderAsync(SIDE, event.doc)
  }

  async removefolder (event /*: LayerRemoveEvent */) {
    await this.target.trashFolderAsync(SIDE, event.doc)
  }
}

/* @flow */

/*::
import type { Layer, LayerEvent } from './events'
*/

// Sequential is a base class for layers that must preserve the orders of
// initial and process calls. The subclasses must call the super constructor
// with the next layer and overload the doProcess method.
module.exports = class Sequential /*:: implements Layer */ {
  /*::
  next: Layer
  task : Promise<*>
  */

  constructor (next /*: Layer */) {
    this.next = next
    this.task = Promise.resolve()
  }

  async initial () {
    let result
    const previousTask = this.task
    this.task = new Promise(async (resolve) => {
      await previousTask
      result = this.next.initial()
      resolve()
    })
    await this.task
    return result
  }

  async process (events /*: LayerEvent[] */) {
    let result
    const previousTask = this.task
    this.task = new Promise(async (resolve) => {
      await previousTask
      events = await this.doProcess(events)
      result = this.next.process(events)
      resolve()
    })
    await this.task
    return result
  }

  async doProcess (events /*: Array<*> */) {
    throw new Error('This method must be overloaded!')
  }
}

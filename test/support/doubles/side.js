/* @flow */

const sinon = require('sinon')

/*::
import type { SideName } from '../../../core/side'
import type { Writer } from '../../../core/writer'
*/

const METHODS = [
  'addFileAsync',
  'addFolderAsync',
  'overwriteFileAsync',
  'updateFileMetadataAsync',
  'updateFolderAsync',
  'moveAsync',
  'assignNewRemote',
  'trashAsync',
  'deleteFolderAsync',
  'renameConflictingDocAsync',
  'diskUsage'
]

module.exports = function stubSide(name /*: SideName */) /*: Writer */ {
  const double = {}
  for (let method of METHODS) {
    double[method] = sinon.stub().resolves()
  }
  double.name = name
  double.watcher = {}
  double.watcher.running = new Promise(() => {})
  return double
}

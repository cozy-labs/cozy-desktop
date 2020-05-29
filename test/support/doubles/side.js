/* @flow */

const sinon = require('sinon')

/*::
import type { Writer } from '../../../core/writer'
*/

const METHODS = [
  'addFileAsync',
  'addFolderAsync',
  'overwriteFileAsync',
  'updateFileMetadataAsync',
  'updateFolderAsync',
  'moveAsync',
  'assignNewRev',
  'trashAsync',
  'deleteFolderAsync',
  'renameConflictingDocAsync'
]

module.exports = function stubSide() /*: Writer */ {
  const double = {}
  for (let method of METHODS) {
    double[method] = sinon.stub().resolves()
  }
  double.watcher = {}
  double.watcher.running = new Promise(() => {})
  double.watcher.pause = sinon.stub().returns()
  double.watcher.resume = sinon.stub().returns()
  return double
}

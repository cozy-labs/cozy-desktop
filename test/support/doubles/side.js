/* @flow */

const sinon = require('sinon')

/*::
import type { Side } from '../../../core/side'
*/

const METHODS = [
  'addFileAsync',
  'addFolderAsync',
  'overwriteFileAsync',
  'updateFileMetadataAsync',
  'updateFolderAsync',
  'moveFileAsync',
  'moveFolderAsync',
  'assignNewRev',
  'trashAsync',
  'deleteFolderAsync',
  'renameConflictingDocAsync'
]

module.exports = function stubSide() /*: Side */ {
  const double = {}
  for (let method of METHODS) {
    double[method] = sinon.stub().resolves()
  }
  double.watcher = {}
  double.watcher.running = new Promise(() => {})
  return double
}

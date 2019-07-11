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
  'moveFileAsync',
  'moveFolderAsync',
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
  return double
}

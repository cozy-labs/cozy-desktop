/* @flow */

import type { Side } from '../../../core/side'

const sinon = require('sinon')

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

module.exports = function stubSide (): Side {
  const double = {}
  for (let method of METHODS) {
    double[method] = sinon.stub().resolves()
  }
  return double
}

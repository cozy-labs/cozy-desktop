/* @flow */

import sinon from 'sinon'

import type { Side } from '../../../core/side'

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

export default function stubSide (): Side {
  const double = {}
  for (let method of METHODS) {
    double[method] = sinon.stub().resolves()
  }
  return double
}

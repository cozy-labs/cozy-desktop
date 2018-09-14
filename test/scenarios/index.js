/* @flow */

/*::
type FSAddDirAction = {|type: 'mkdir', path: string|}
type FSAddFileAction = {|type: '>', path: string|}
type FSDeleteAction = {|type: 'delete', path: string|}
type FSMoveAction = {|type: 'mv', force?: true, merge?: true, src: string, dst: string|}
type FSRestoreAction = {|type: 'restore', pathInTrash: string|}
type FSTrashAction = {|type: 'trash', path: string|}
type FSUpdateFileAction = {|type: '>>', path: string|}
type FSWaitAction = {|type: 'wait', ms: number|}

type FSAction
  = FSAddDirAction
  | FSAddFileAction
  | FSDeleteAction
  | FSMoveAction
  | FSRestoreAction
  | FSTrashAction
  | FSUpdateFileAction
  | FSWaitAction

type PrepAddFileExpectation = {|method: 'addFileAsync', path: string|}
type PrepDeleteFileExpectation = {|method: 'deleteFileAsync', path: string|}
type PrepDeleteFolderExpectation = {|method: 'deleteFolderAsync', path: string|}
type PrepMoveFileExpectation = {|method: 'moveFileAsync', src: string, dst: string|}
type PrepMoveFolderExpectation = {|method: 'moveFolderAsync', src: string, dst: string|}
type PrepPutFolderExpectation = {|method: 'putFolderAsync', path: string|}
type PrepRestoreFileExpectation = {|method: 'restoreFileAsync', dst: string|}
type PrepRestoreFolderExpectation = {|method: 'restoreFolderAsync', dst: string|}
type PrepTrashFileExpectation = {|method: 'trashFileAsync', path: string|}
type PrepTrashFolderExpectation = {|method: 'trashFolderAsync', path: string|}
type PrepUpdateFileExpectation = {|method: 'updateFileAsync', path: string|}

type PrepExpectation
  = PrepAddFileExpectation
  | PrepDeleteFileExpectation
  | PrepDeleteFolderExpectation
  | PrepMoveFileExpectation
  | PrepMoveFolderExpectation
  | PrepPutFolderExpectation
  | PrepRestoreFileExpectation
  | PrepRestoreFolderExpectation
  | PrepTrashFileExpectation
  | PrepTrashFolderExpectation
  | PrepUpdateFileExpectation

export type Scenario = {|
  noremote?: true,
  init?: Array<{|
    ino: number, path: string, content?: string
  |}>,
  actions: Array<FSAction>,
  expected: {|
    prepCalls?: Array<PrepExpectation>,
    tree?: Array<string>,
    remoteTrash?: Array<string>,
    contents?: { [string]: string }
  |}
|}
*/

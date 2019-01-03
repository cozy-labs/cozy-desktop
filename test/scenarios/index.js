/* @flow */

/*::
import type { SideName } from '../../core/metadata'

type FSAddDirAction = {|
  type: 'mkdir',
  path: string
|}

type FSCreateFileAction = {|
  type: 'create_file',
  path: string
|}

type FSDeleteAction = {|
  type: 'delete',
  path: string
|}

type FSMoveAction = {|
  type: 'mv',
  force?: true,
  merge?: true,
  src: string,
  dst: string
|}

type FSRestoreAction = {|
  type: 'restore',
  pathInTrash: string
|}

type FSTrashAction = {|
  type: 'trash',
  path: string
|}

type FSUpdateFileAction = {|
  type: 'update_file',
  path: string,
  content: string
|}

type FSWaitAction = {|
  type: 'wait',
  ms: number
|}

type FSAction
  = FSAddDirAction
  | FSCreateFileAction
  | FSDeleteAction
  | FSMoveAction
  | FSRestoreAction
  | FSTrashAction
  | FSUpdateFileAction
  | FSWaitAction

export type Scenario = {|
  platforms?: Array<'win32'|'darwin'|'linux'>,
  side?: SideName,
  init?: Array<{|
    ino: number, path: string, content?: string
  |}>,
  actions: Array<FSAction>,
  expected: {|
    localTree?: Array<string>,
    remoteTree?: Array<string>,
    tree?: Array<string>,
    remoteTrash?: Array<string>,
    contents?: { [string]: string }
  |}
|}
*/

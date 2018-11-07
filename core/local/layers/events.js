/* @flow */

/*::
import type { Metadata } from '../../metadata'

export type AtomWatcherEvent = {
  action: "created" | "modified" | "deleted" | "renamed",
  kind: "file" | "directory" | "symlink" | "unknown",
  path: string,
  oldPath: string
}

export type Action = "add" | "move" | "update" | "remove"
export type DocType = "file" | "folder"

export type LayerAddEvent = {
  action: "add",
  abspath: string,
  doc: Metadata
}

export type LayerUpdateEvent = {
  action: "update",
  abspath: string,
  doc: Metadata
}

export type LayerMoveEvent = {
  action: "move",
  abspath: string,
  doc: Metadata,
  src: Metadata
}

export type LayerRemoveEvent = {
  action: "remove",
  abspath: string,
  doc: Metadata
}

export type LayerEvent = LayerAddEvent | LayerUpdateEvent | LayerMoveEvent | LayerRemoveEvent

export interface Layer {
  initial(): Promise<*>,
  process(events: LayerEvent[]): Promise<*>
}
*/

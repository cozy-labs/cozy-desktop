/* @flow */

export type PathObject = {
  path: string
}

export function getPath (target: string|PathObject) {
  return typeof target === 'string' ? target : target.path
}

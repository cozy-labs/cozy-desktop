/* @flow */

/*::
export type PathObject = {
  path: string
}
*/

module.exports = {
  getPath
}

function getPath (target /*: string|PathObject */) {
  return typeof target === 'string' ? target : target.path
}

/**  Provides a stream.Readable for local or remote file corresponding to the
 * given metadata.
 *
 * See the `Reader` type.
 *
 * @module core/reader
 * @flow
 */

// FIXME:
// eslint-disable-next-line
const stream = require('stream')

/*::
import type { Metadata } from './metadata'
*/

class ReadableWithContentLength /*:: extends stream.Readable */ {
  /*::
  contentLength: ?number
  */
}

function withContentLength(
  s /*: stream.Readable */,
  contentLength /*: ?number */
) /*: ReadableWithContentLength */ {
  const s2 /*: ReadableWithContentLength */ = (s /*: any */)
  s2.contentLength = contentLength
  return s2
}

/*::
export interface Reader {
  createReadStreamAsync (Metadata): Promise<ReadableWithContentLength>;
}
*/

module.exports = {
  ReadableWithContentLength,
  withContentLength
}

/** Utility module providing methods and types to deal with streams
 *
 * @module core/utils/stream
 * @flow
 */

/*::
import type { Readable } from 'stream'

export type ReadableWithSize = Readable & { size: number }
export type ProgressReport = {
  total: number,
  transferred: number
}
export type ProgressCallback = (ProgressReport) => any
*/

/* withProgress returns a Readable stream with a total `size` and that emits
 * ProgressReports.
 *
 * Consumers can determine if `progress` events will be emitted by checking the
 * value of `emitsProgress`.
 */
const withProgress = (
  source /*: ReadableWithSize */,
  onProgress /*: ?ProgressCallback */
) /*: ReadableWithSize */ => {
  const progress /*: ProgressReport */ = {
    total: source.size,
    transferred: 0
  }

  // We want to avoid emitting progress after the source stream encountered an
  // error so we don't need to keep track of failed transfers for which we
  // should discard progress reports.
  let emitProgress = true

  // The source stream needs to be paused before we attach the `data` event
  // listener as attaching it sets the stream to flowing mode and we could miss
  // data if the destination stream has not already been piped to.
  // If forced to pause before attaching the event listener, the source stream
  // won't flow data until the destination stream is piped to.
  source.pause()
  source.on('error', () => {
    emitProgress = false
  })
  source.on('data', chunk => {
    // Emit previously stored progress as the `data` event is emitted when the
    // source stream has received the data but not when its destination has read
    // it.
    // By waiting for the next `data` event, we give some time to the
    // destination to read the previous data although we have no way to know if
    // it's been read or not.
    // In any case, the final progress report will only be sent once both the
    // source and destination streams have been closed so the file download will
    // only be seen as finished once we are actually done writing it to the
    // destination.
    if (emitProgress && onProgress) onProgress(progress)
    progress.transferred += chunk.length
  })
  source.on('close', () => {
    if (emitProgress && onProgress) onProgress(progress)
  })

  return source
}

const withSize = (
  readable /*: Readable */,
  size /*: number */
) /*: ReadableWithSize */ => {
  const readableWithSize /*: any */ = readable
  readableWithSize.size = size
  return readableWithSize
}

module.exports = {
  withProgress,
  withSize
}

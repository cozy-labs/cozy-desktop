/* @flow */

const { NOTE_MIME_TYPE } = require('../remote/constants')

/*::
import type { Metadata } from '../metadata'
*/

const isNote = (
  doc /*: { mime?: string, metadata?: Object } */
) /*: boolean %checks */ => {
  return (
    doc.mime === NOTE_MIME_TYPE &&
    doc.metadata != null &&
    doc.metadata.content != null &&
    doc.metadata.schema != null &&
    doc.metadata.title != null &&
    doc.metadata.version != null
  )
}

module.exports = {
  isNote
}

/**
 * @module core/remote/constants
 * @see https://github.com/cozy/cozy-stack/blob/master/pkg/consts/consts.go
 * @flow
 */

/*::
export type FILE_TYPE = 'file'
export type DIR_TYPE = 'directory'
*/

module.exports = {
  // Doctypes
  FILES_DOCTYPE: 'io.cozy.files',

  // Files document type
  DIR_TYPE: 'directory',
  FILE_TYPE: 'file',

  // Special document ids
  ROOT_DIR_ID: 'io.cozy.files.root-dir',
  TRASH_DIR_ID: 'io.cozy.files.trash-dir',

  TRASH_DIR_NAME: '.cozy_trash',

  // Special MIME types
  NOTE_MIME_TYPE: 'text/vnd.cozy.note+markdown'
}

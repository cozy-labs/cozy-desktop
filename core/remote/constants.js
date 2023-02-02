/**
 * @module core/remote/constants
 * @see https://github.com/cozy/cozy-stack/blob/master/pkg/consts/consts.go
 * @flow
 */

/*::
export type FILE_TYPE = 'file'
export type DIR_TYPE = 'directory'
export type FILES_DOCTYPE = 'io.cozy.files'
export type VERSIONS_DOCTYPE = 'io.cozy.files.versions'
*/

const DEFAULT_HEARTBEAT = 1000 * 60 // 1 minute
const FIVE_GIGABYTES = 5368709122 // bytes

module.exports = {
  // Doctypes
  FILES_DOCTYPE: 'io.cozy.files',
  OAUTH_CLIENTS_DOCTYPE: 'io.cozy.oauth.clients',
  VERSIONS_DOCTYPE: 'io.cozy.files.versions',

  // Files document type
  DIR_TYPE: 'directory',
  FILE_TYPE: 'file',

  // Special document ids
  ROOT_DIR_ID: 'io.cozy.files.root-dir',
  TRASH_DIR_ID: 'io.cozy.files.trash-dir',

  TRASH_DIR_NAME: '.cozy_trash',

  // Special MIME types
  NOTE_MIME_TYPE: 'text/vnd.cozy.note+markdown',

  // Remote watcher changes fetch interval
  HEARTBEAT: parseInt(process.env.COZY_DESKTOP_HEARTBEAT) || DEFAULT_HEARTBEAT,

  REMOTE_WATCHER_FATAL_EVENT: 'RemoteWatcher:fatal',

  // ToS updated warning code
  TOS_UPDATED_WARNING_CODE: 'tos-updated',

  // Maximum file size allowed by Swift thus the remote Cozy.
  // See https://docs.openstack.org/kilo/config-reference/content/object-storage-constraints.html
  MAX_FILE_SIZE: FIVE_GIGABYTES,

  // Initial CouchDB sequence
  INITIAL_SEQ: '0'
}

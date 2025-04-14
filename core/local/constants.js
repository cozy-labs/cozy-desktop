/**
 * @module core/local/constants
 * @flow
 */

module.exports = {
  DEFAULT_SYNC_DIR_NAME: 'Twake',
  LEGACY_DEFAULT_SYNC_DIR_NAME: 'Cozy Drive',

  // This constant is not made directly available through `fs` but comes from libuv.
  // See https://github.com/libuv/libuv/blob/30ff5bf2161257921f3a3ce5655804f7cb282aa9/include/uv/win.h#L685
  UV_FS_O_EXLOCK: 0x10000000,

  LOCAL_WATCHER_FATAL_EVENT: 'LocalWatcher:fatal'
}

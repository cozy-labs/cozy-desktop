
// @TODO : chokidar does not detect any event for this scenario.

module.exports = {
  init: [
    { ino: 1, path: 'parent/' },
    { ino: 2, path: 'parent/dirorfile/' }
  ],
  actions: [
    {type: 'rm', path: 'parent/dirorfile/'},
    {type: '>', path: 'parent/dirorfile'}
  ],
  expected: {
    prepCalls: [ /*
      {method: 'trashFolderAsync', path: 'parent/dirorfile'},
      {method: 'addFileAsync', path: 'parent/dirorfile'}
    */ ]
  }
}

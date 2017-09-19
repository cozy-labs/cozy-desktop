module.exports = {
  init: [
    'parent/',
    'parent/dst/',
    'parent/src/',
    'parent/src/dir/',
    'parent/src/dir/empty-subdir/',
    'parent/src/dir/subdir/',
    'parent/src/dir/subdir/file',
  ],
  actions: [
    {type: "mv", src: "parent/src/dir", dst: "parent/dst/dir"},
  ],
  expected: {
    prepCalls: [
      { method: 'putFolderAsync', path: 'parent/dst/dir' },
      { method: 'putFolderAsync', path: 'parent/dst/dir/empty-subdir' },
      { method: 'putFolderAsync', path: 'parent/dst/dir/subdir' },
      {method: 'moveFileAsync', dst: 'parent/dst/dir/subdir/file', src: 'parent/src/dir/subdir/file'},
      {method: 'trashFolderAsync', path: 'parent/src/dir/subdir'},
      {method: 'trashFolderAsync', path: 'parent/src/dir/empty-subdir'},
      {method: 'trashFolderAsync', path: 'parent/src/dir'},
    ],
  },
}

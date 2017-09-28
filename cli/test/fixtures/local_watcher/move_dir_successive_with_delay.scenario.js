module.exports = {
  init: [
    'parent/',
    'parent/dst1/',
    'parent/dst2/',
    'parent/src/',
    'parent/src/dir/',
    'parent/src/dir/empty-subdir/',
    'parent/src/dir/subdir/',
    'parent/src/dir/subdir/file',
  ],
  actions: [
    {type: "mv", src: "parent/src/dir", dst: "parent/dst1/dir"},
    {type: "wait", ms: 1000},
    {type: "mv", src: "parent/dst1/dir", dst: "parent/dst2/dir"},
  ],
  expected: {
    prepCalls: [
      { method: 'putFolderAsync', path: 'parent/dst2/dir' },
      { method: 'putFolderAsync', path: 'parent/dst2/dir/empty-subdir' },
      { method: 'putFolderAsync', path: 'parent/dst2/dir/subdir' },
      {method: 'moveFileAsync', dst: 'parent/dst2/dir/subdir/file', src: 'parent/src/dir/subdir/file'},
      {method: 'trashFolderAsync', path: 'parent/src/dir/subdir'},
      {method: 'trashFolderAsync', path: 'parent/src/dir/empty-subdir'},
      {method: 'trashFolderAsync', path: 'parent/src/dir'},
    ],
  },
}

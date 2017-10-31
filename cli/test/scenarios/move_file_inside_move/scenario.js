module.exports = {
  init: [
    { ino: 1, path: 'parent/' },
    { ino: 3, path: 'parent/dst/' },
    { ino: 4, path: 'parent/src/' },
    { ino: 5, path: 'parent/src/dir/' },
    { ino: 6, path: 'parent/src/dir/empty-subdir/' },
    { ino: 7, path: 'parent/src/dir/subdir/' },
    { ino: 8, path: 'parent/src/dir/subdir/file' }
  ],
  actions: [
    {type: 'mv', src: 'parent/src/dir/subdir/file', dst: 'parent/src/dir/subdir/filerenamed'},
    {type: 'mv', src: 'parent/src/dir', dst: 'parent/dst/dir'}
  ],
  expected: {
    // prepCalls: [
    //   {method: 'moveFileAsync', dst: 'parent/dst/dir/subdir/filerenamed', src: 'parent/src/dir'},
    //   {method: 'moveFolderAsync', dst: 'parent/dst/subdir', src: 'parent/src/dir/subdir'}
    // ],
    tree: [
      'parent/',
      'parent/dst/',
      'parent/dst/dir/',
      'parent/dst/dir/empty-subdir/',
      'parent/dst/dir/subdir/',
      'parent/dst/dir/subdir/filerenamed',
      'parent/src/'
    ],
    remoteTrash: []
  }
}

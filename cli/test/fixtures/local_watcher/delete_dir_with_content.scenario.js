module.exports = {
  init: [
    'parent/',
    'parent/dir/',
    'parent/dir/empty-subdir/',
    'parent/dir/subdir/',
    'parent/dir/subdir/file',
    'parent/other_dir/'
  ],
  actions: [
    {type: 'rm', path: 'parent/dir'}
  ],
  expected: {
    prepCalls: [
      {method: 'trashFileAsync', path: 'parent/dir/subdir/file'},
      {method: 'trashFolderAsync', path: 'parent/dir/subdir'},
      {method: 'trashFolderAsync', path: 'parent/dir/empty-subdir'},
      {method: 'trashFolderAsync', path: 'parent/dir'}
    ]
  }
}

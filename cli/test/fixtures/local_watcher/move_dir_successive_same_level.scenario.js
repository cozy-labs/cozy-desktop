module.exports = {
  init: [
    'parent/',
    'parent/dst1/',
    'parent/dst2/',
    'parent/src/',
    'parent/src/dir/',
    'parent/src/dir/empty-subdir/',
    'parent/src/dir/subdir/',
    'parent/src/dir/subdir/file'
  ],
  actions: [
    {type: 'mv', src: 'parent/src/dir', dst: 'parent/dst1/dir'},
    {type: 'mv', src: 'parent/dst1/dir', dst: 'parent/dst2/dir'}
  ],
  expected: {
    prepCalls: [
      {method: 'moveFolderAsync', dst: 'parent/dst2/dir', src: 'parent/src/dir'}
    ]
  }
}

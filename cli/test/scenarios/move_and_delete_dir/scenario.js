module.exports = {
  init: [
    {ino: 1, path: 'dst/'},
    {ino: 2, path: 'src/'},
    {ino: 3, path: 'src/subdir/'}
  ],
  actions: [
    {type: 'mv', src: 'src/subdir', dst: 'dst/subdir'},
    {type: 'wait', ms: 1500},
    {type: 'delete', path: 'dst/subdir'}
  ],
  expected: {
    prepCalls: [
      {method: 'trashFolderAsync', path: 'src/subdir'}
    ],
    tree: [
      'dst/',
      'src/'
    ],
    remoteTrash: []
  }
}

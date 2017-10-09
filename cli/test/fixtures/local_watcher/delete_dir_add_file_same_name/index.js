module.exports = {
  init: [
    {ino: 1, path: 'foo/'}
  ],
  actions: [
    {type: 'rm', path: 'foo'},
    {type: '>', path: 'foo'}
  ],
  expected: {
    prepCalls: [
      {method: 'deleteFolderAsync', path: 'foo'},
      {method: 'addFileAsync', path: 'foo'}
    ]
  }
}

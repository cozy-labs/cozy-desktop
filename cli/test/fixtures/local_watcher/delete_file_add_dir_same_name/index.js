module.exports = {
  init: [
    {ino: 1, path: 'foo'}
  ],
  actions: [
    {type: 'rm', path: 'foo'},
    {type: 'mkdir', path: 'foo'}
  ],
  expected: {
    prepCalls: [
      {method: 'deleteFileAsync', path: 'foo'},
      {method: 'putFolderAsync', path: 'foo'}
    ]
  }
}

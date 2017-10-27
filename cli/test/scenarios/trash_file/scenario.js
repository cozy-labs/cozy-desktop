module.exports = {
  init: [
    {ino: 1, path: 'foo'}
  ],
  actions: [
    {type: 'trash', path: 'foo'}
  ],
  expected: {
    prepCalls: [
      {method: 'trashFileAsync', path: 'foo'}
    ],
    tree: [],
    remoteTrash: [
      'foo'
    ]
  }
}

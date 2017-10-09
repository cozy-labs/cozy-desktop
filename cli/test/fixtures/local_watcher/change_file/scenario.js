module.exports = {
  init: [
    { ino: 1, path: 'file' },
  ],
  actions: [
    {type: '>>', path: 'file'}
  ],
  expected: {
    prepCalls: [
      {method: 'updateFileAsync', path: 'file'}
    ]
  }
}

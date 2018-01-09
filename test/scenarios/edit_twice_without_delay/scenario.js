module.exports = {
  init: [
    { ino: 1, path: 'file' }
  ],
  actions: [
    {type: '>>', path: 'file'},
    {type: '>>', path: 'file'}
  ],
  expected: {
    prepCalls: [
      {method: 'updateFileAsync', path: 'file'}
    ],
    tree: [
      'file'
    ]
  }
}

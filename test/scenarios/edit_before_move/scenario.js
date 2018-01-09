module.exports = {
  init: [
    { ino: 1, path: 'file', content: 'foo' }
  ],
  actions: [
    {type: '>>', path: 'file', content: 'bar'},
    {type: 'mv', src: 'file', dst: 'renamed-file'}
  ],
  expected: {
    prepCalls: [
      {method: 'updateFileAsync', path: 'file'},
      {method: 'moveFileAsync', src: 'file', dst: 'renamed-file'}
    ],
    tree: [
      'renamed-file'
    ],
    content: {
      'renamed-file': 'foobar'
    }
  }
}

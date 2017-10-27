module.exports = {
  actions: [
    {type: '>', path: 'file'},
    {type: 'wait', ms: 1500},
    {type: 'delete', path: 'file'}
  ],
  expected: {
    prepCalls: [],
    tree: [],
    remoteTrash: []
  }
}

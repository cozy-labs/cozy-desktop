const {describe, it} = require('mocha')
const remoteChange = require('../../../core/remote/change')

describe('remote change sort', () => {
  it('sort correctly move inside move', () => {
    const parent = {
      'doc': {'path': 'parent/dst/dir'},
      'type': 'FolderMoved',
      'was': {'path': 'parent/src/dir'}
    }
    const child = {
      'doc': {'path': 'parent/dst/dir/subdir/filerenamed'},
      'type': 'FileMoved',
      'was': {'path': 'parent/dst/dir/subdir/file'}
    }
    const a = [child, parent]
    remoteChange.sort(a)
    a.should.deepEqual([parent, child])
  })
})

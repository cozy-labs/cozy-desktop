/* eslint-env mocha */

const remoteChange = require('../../../core/remote/change')

describe('remote change sort', () => {
  it('sort correctly move inside move', () => {
    const parent = {
      'doc': {'path': 'parent/dst/dir'},
      'type': 'FolderMove',
      'was': {'path': 'parent/src/dir'}
    }
    const child = {
      'doc': {'path': 'parent/dst/dir/subdir/filerenamed'},
      'type': 'FileMove',
      'was': {'path': 'parent/dst/dir/subdir/file'}
    }
    const a = [child, parent]
    remoteChange.sort(a)
    a.should.deepEqual([parent, child])
  })
})

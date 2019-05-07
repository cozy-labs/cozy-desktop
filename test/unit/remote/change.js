/* eslint-env mocha */

const remoteChange = require('../../../core/remote/change')

describe('remote change sort', () => {
  it('sort correctly move inside move', () => {
    const parent = {
      doc: { path: 'parent/dst/dir' },
      type: 'FolderMove',
      was: { path: 'parent/src/dir' }
    }
    const child = {
      doc: { path: 'parent/dst/dir/subdir/filerenamed' },
      type: 'FileMove',
      was: { path: 'parent/dst/dir/subdir/file' }
    }
    const a = [child, parent]
    remoteChange.sort(a)
    a.should.deepEqual([parent, child])
  })

  describe('sorts deleted before created for the same path', () => {
    const deleted = {
      doc: { path: 'parent/file' },
      type: 'FileDeletion'
    }

    const created = {
      doc: { path: 'parent/file' },
      type: 'FileAddition'
    }

    it('when deleted comes before created', () => {
      const changes = [deleted, created]
      remoteChange.sort(changes)
      changes.should.deepEqual([deleted, created])
    })

    it('when created comes before deleted', () => {
      const changes = [created, deleted]
      remoteChange.sort(changes)
      changes.should.deepEqual([deleted, created])
    })
  })
})

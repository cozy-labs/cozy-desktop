/* eslint-env mocha */

const path = require('path')
const should = require('should')

const remoteChange = require('../../../core/remote/change')

describe('remote change sort', () => {
  describe('with movee inside move', () => {
    const expected = [
      {
        doc: { path: path.normalize('parent/dst/dir') },
        type: 'DirMove',
        was: { path: path.normalize('parent/src/dir') }
      },
      {
        doc: { path: path.normalize('parent/dst/dir/empty-subdir') },
        type: 'DescendantChange',
        was: { path: path.normalize('parent/src/dir/empty-subdir') }
      },
      {
        doc: { path: path.normalize('parent/dst/dir/subdir') },
        type: 'DescendantChange',
        was: { path: path.normalize('parent/src/dir/subdir') }
      },
      {
        doc: { path: path.normalize('parent/dst/dir/subdir/filerenamed') },
        type: 'FileMove',
        was: { path: path.normalize('parent/dst/dir/subdir/file') }
      },
      {
        doc: { path: path.normalize('parent/dst/dir/subdir/filerenamed2') },
        type: 'FileMove',
        was: { path: path.normalize('parent/dst/dir/subdir/file2') }
      }
    ]

    it('sorts parents before children', () => {
      const order1 = [
        {
          doc: { path: path.normalize('parent/dst/dir/subdir/filerenamed2') },
          type: 'FileMove',
          was: { path: path.normalize('parent/dst/dir/subdir/file2') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/empty-subdir') },
          type: 'DescendantChange',
          was: { path: path.normalize('parent/src/dir/empty-subdir') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/subdir') },
          type: 'DescendantChange',
          was: { path: path.normalize('parent/src/dir/subdir') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/subdir/filerenamed') },
          type: 'FileMove',
          was: { path: path.normalize('parent/dst/dir/subdir/file') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir') },
          type: 'DirMove',
          was: { path: path.normalize('parent/src/dir') }
        }
      ]
      remoteChange.sort(order1)
      should(order1).deepEqual(expected)

      const order2 = [
        {
          doc: { path: path.normalize('parent/dst/dir/subdir/filerenamed2') },
          type: 'FileMove',
          was: { path: path.normalize('parent/dst/dir/subdir/file2') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/empty-subdir') },
          type: 'DescendantChange',
          was: { path: path.normalize('parent/src/dir/empty-subdir') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/subdir/filerenamed') },
          type: 'FileMove',
          was: { path: path.normalize('parent/dst/dir/subdir/file') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/subdir') },
          type: 'DescendantChange',
          was: { path: path.normalize('parent/src/dir/subdir') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir') },
          type: 'DirMove',
          was: { path: path.normalize('parent/src/dir') }
        }
      ]
      remoteChange.sort(order2)
      should(order2).deepEqual(expected)

      const order3 = [
        {
          doc: { path: path.normalize('parent/dst/dir/subdir/filerenamed') },
          type: 'FileMove',
          was: { path: path.normalize('parent/dst/dir/subdir/file') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/subdir') },
          type: 'DescendantChange',
          was: { path: path.normalize('parent/src/dir/subdir') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/empty-subdir') },
          type: 'DescendantChange',
          was: { path: path.normalize('parent/src/dir/empty-subdir') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir') },
          type: 'DirMove',
          was: { path: path.normalize('parent/src/dir') }
        },
        {
          doc: { path: path.normalize('parent/dst/dir/subdir/filerenamed2') },
          type: 'FileMove',
          was: { path: path.normalize('parent/dst/dir/subdir/file2') }
        }
      ]
      remoteChange.sort(order3)
      should(order3).deepEqual(expected)
    })
  })

  describe('sorts deleted before created for the same path', () => {
    const deleted = {
      doc: { path: path.normalize('parent/file') },
      type: 'FileDeletion'
    }

    const created = {
      doc: { path: path.normalize('parent/file') },
      type: 'FileAddition'
    }

    it('when deleted comes before created', () => {
      const changes = [deleted, created]
      remoteChange.sort(changes)
      should(changes).deepEqual([deleted, created])
    })

    it('when created comes before deleted', () => {
      const changes = [created, deleted]
      remoteChange.sort(changes)
      should(changes).deepEqual([deleted, created])
    })
  })
})

describe('isOnlyChildMove(p, c)', () => {
  const p = {
    doc: { path: 'dst' },
    type: 'DirMove',
    was: { path: 'src' }
  }

  it('returns false if c is not a move', () => {
    const c1 = {
      doc: { path: path.normalize('dst/file') },
      type: 'FileDeletion'
    }

    should(remoteChange.isOnlyChildMove(p, c1)).be.false()

    const c2 = {
      doc: { path: path.normalize('src/file') },
      type: 'FileDeletion'
    }

    should(remoteChange.isOnlyChildMove(p, c2)).be.false()
  })

  it('returns false if c is not a move of a child of p', () => {
    const c1 = {
      doc: { path: path.normalize('dir/file') },
      type: 'FileMove',
      was: { path: 'file' }
    }

    should(remoteChange.isOnlyChildMove(p, c1)).be.false()

    const c2 = {
      doc: { path: path.normalize('dst/file') },
      type: 'FileMove',
      was: { path: 'file' }
    }

    should(remoteChange.isOnlyChildMove(p, c2)).be.false()

    const c3 = {
      doc: { path: path.normalize('src/file') },
      type: 'FileMove',
      was: { path: 'file' }
    }

    should(remoteChange.isOnlyChildMove(p, c3)).be.false()

    const c4 = {
      doc: { path: path.normalize('src/dir') },
      type: 'DirMove',
      was: { path: 'dir' }
    }

    should(remoteChange.isOnlyChildMove(p, c4)).be.false()

    const c5 = {
      doc: { path: path.normalize('dst/dir') },
      type: 'DirMove',
      was: { path: 'dir' }
    }

    should(remoteChange.isOnlyChildMove(p, c5)).be.false()

    const c6 = {
      doc: { path: path.normalize('parent/dir') },
      type: 'DirMove',
      was: { path: 'dir' }
    }

    should(remoteChange.isOnlyChildMove(p, c6)).be.false()
  })

  it('returns false if c is a move of a child of p outside p', () => {
    const c1 = {
      doc: { path: 'file' },
      type: 'FileMove',
      was: { path: path.normalize('src/file') }
    }

    should(remoteChange.isOnlyChildMove(p, c1)).be.false()

    const c2 = {
      doc: { path: 'file' },
      type: 'FileMove',
      was: { path: path.normalize('dst/file') }
    }

    should(remoteChange.isOnlyChildMove(p, c2)).be.false()

    const c3 = {
      doc: { path: 'dir' },
      type: 'DirMove',
      was: { path: path.normalize('src/dir') }
    }

    should(remoteChange.isOnlyChildMove(p, c3)).be.false()

    const c4 = {
      doc: { path: 'dir' },
      type: 'DirMove',
      was: { path: path.normalize('dst/dir') }
    }

    should(remoteChange.isOnlyChildMove(p, c4)).be.false()
  })

  it('returns false if c is a renaming of a child of p within p', () => {
    const c1 = {
      doc: { path: path.normalize('dst/file2') },
      type: 'FileMove',
      was: { path: path.normalize('src/file') }
    }

    should(remoteChange.isOnlyChildMove(p, c1)).be.false()

    const c2 = {
      doc: { path: path.normalize('dst/dir2') },
      type: 'DirMove',
      was: { path: path.normalize('src/dir') }
    }

    should(remoteChange.isOnlyChildMove(p, c2)).be.false()

    const c3 = {
      doc: { path: path.normalize('dst/file2') },
      type: 'FileMove',
      was: { path: path.normalize('dst/file') }
    }

    should(remoteChange.isOnlyChildMove(p, c3)).be.false()

    const c4 = {
      doc: { path: path.normalize('dst/dir2') },
      type: 'DirMove',
      was: { path: path.normalize('dst/dir') }
    }

    should(remoteChange.isOnlyChildMove(p, c4)).be.false()
  })

  it('returns true if c is a child move of p', () => {
    const c1 = {
      doc: { path: path.normalize('dst/file') },
      type: 'FileMove',
      was: { path: path.normalize('src/file') }
    }

    should(remoteChange.isOnlyChildMove(p, c1)).be.true()

    const c2 = {
      doc: { path: path.normalize('dst/dir') },
      type: 'DirMove',
      was: { path: path.normalize('src/dir') }
    }

    should(remoteChange.isOnlyChildMove(p, c2)).be.true()
  })

  it('returns true if c is a child move of a move of a child of p', () => {
    const c1 = {
      doc: { path: path.normalize('dst/dir2/file') },
      type: 'FileMove',
      was: { path: path.normalize('src/dir/file') }
    }

    should(remoteChange.isOnlyChildMove(p, c1)).be.true()

    const c2 = {
      doc: { path: path.normalize('dst/parent2/dir') },
      type: 'DirMove',
      was: { path: path.normalize('src/parent/dir') }
    }

    should(remoteChange.isOnlyChildMove(p, c2)).be.true()
  })
})

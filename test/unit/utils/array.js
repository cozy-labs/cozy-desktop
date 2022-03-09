/* @flow */
/* eslint-env mocha */

const should = require('should')

const { sortBy } = require('../../../core/utils/array')

describe('utils/array', () => {
  describe('sortBy', () => {
    it('sorts elements in ascending order based on the given attribute', () => {
      const elems = [
        { id: 1, path: 'dir/subdir' },
        { id: 2, path: 'other-dir' },
        { id: 3, path: 'dir/subdir/file' },
        { id: 4, path: 'dir' }
      ]

      elems.sort(sortBy({ path: 'asc' }))

      should(elems.map(e => e.path)).deepEqual([
        'dir',
        'dir/subdir',
        'dir/subdir/file',
        'other-dir'
      ])
    })

    it('sorts elements in descending order based on the given attribute', () => {
      const elems = [
        { id: 1, path: 'dir/subdir' },
        { id: 2, path: 'other-dir' },
        { id: 3, path: 'dir/subdir/file' },
        { id: 4, path: 'dir' }
      ]

      elems.sort(sortBy({ path: 'desc' }))

      should(elems.map(e => e.path)).deepEqual([
        'other-dir',
        'dir/subdir/file',
        'dir/subdir',
        'dir'
      ])
    })

    it('sorts elements based on a deep attribute', () => {
      const elems = [
        { id: 1, attributes: { path: 'dir/subdir' } },
        { id: 2, attributes: { path: 'other-dir' } },
        { id: 3, attributes: { path: 'dir/subdir/file' } },
        { id: 4, attributes: { path: 'dir' } }
      ]

      elems.sort(sortBy({ 'attributes.path': 'asc' }))

      should(elems.map(e => e.attributes.path)).deepEqual([
        'dir',
        'dir/subdir',
        'dir/subdir/file',
        'other-dir'
      ])
    })

    it('sorts elements based on non-string values', () => {
      const elems = [
        { id: 4, path: 'dir' },
        { id: 1, path: 'dir/subdir' },
        { id: 3, path: 'dir/subdir/file' },
        { id: 2, path: 'other-dir' }
      ]

      elems.sort(sortBy({ id: 'asc' }))

      should(elems.map(e => e.id)).deepEqual([1, 2, 3, 4])
    })

    it('sorts strings based on their included numbers if the numeric option is passed', () => {
      const elems = [
        { id: 1, path: 'dir/file 10' },
        { id: 2, path: 'dir/annotation' },
        { id: 3, path: 'dir/file 9' },
        { id: 4, path: 'dir' }
      ]

      elems.sort(sortBy({ path: 'desc' }, { numeric: true }))

      should(elems.map(e => e.path)).deepEqual([
        'dir/file 10',
        'dir/file 9',
        'dir/annotation',
        'dir'
      ])
    })
  })
})

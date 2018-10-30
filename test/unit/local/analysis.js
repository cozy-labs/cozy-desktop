/* eslint-env mocha */

const should = require('should')

const analysis = require('../../../core/local/analysis')

const MetadataBuilders = require('../../support/builders/metadata')

/*::
import type { LocalEvent } from '../../../core/local/event'
import type { LocalChange } from '../../../core/local/change'
import type { Metadata } from '../../../core/metadata'
*/

describe('core/local/analysis', function () {
  const sideName = 'local'
  let metadataBuilders

  before(() => { metadataBuilders = new MetadataBuilders() })

  it('do not break on empty array', () => {
    const events /*: LocalEvent[] */ = []
    const pendingChanges /*: LocalChange[] */ = []
    const result /*: LocalChange[] */ = analysis(events, pendingChanges)
    should(result).have.length(0)
  })

  it('handles partial successive moves (add+unlink+add, then unlink later)', () => {
    const old /*: Metadata */ = metadataBuilders.file().ino(1).build()
    const stats = {ino: 1}
    const events /*: LocalEvent[] */ = [
      {type: 'add', path: 'dst1', stats, wip: true},
      {type: 'unlink', path: 'src', old},
      {type: 'add', path: 'dst2', stats, md5sum: 'yolo'}
    ]
    const pendingChanges /*: LocalChange[] */ = []

    should(analysis(events, pendingChanges)).deepEqual([{
      sideName,
      type: 'FileMove',
      path: 'dst2',
      ino: 1,
      md5sum: 'yolo',
      stats,
      old
    }])
    should(pendingChanges).deepEqual([])

    const nextEvents /*: LocalEvent[] */ = [
      {type: 'unlink', path: 'dst1'}
    ]
    should(analysis(nextEvents, pendingChanges)).deepEqual([])
    should(pendingChanges).deepEqual([])
  })

  it('handles unlink+add', () => {
    const old /*: Metadata */ = metadataBuilders.file().ino(1).build()
    const stats = {ino: 1}
    const events /*: LocalEvent[] */ = [
      {type: 'unlink', path: 'src', old},
      {type: 'add', path: 'dst', stats, md5sum: 'yolo'}
    ]
    const pendingChanges /*: LocalChange[] */ = []

    should(analysis(events, pendingChanges)).deepEqual([{
      sideName,
      type: 'FileMove',
      path: 'dst',
      md5sum: 'yolo',
      ino: 1,
      stats,
      old
    }])
    should(pendingChanges).deepEqual([])
  })

  it('handles unlink(x,old=X)+add(X,old=X) (identical renaming loopback) as FileAddition(X) because we lack an x doc to build FileMove(x → X)', () => {
    const ino = 1
    const oldPath = 'x'
    const newPath = 'X'
    const old /*: Metadata */ = metadataBuilders.file().path(newPath).ino(ino).build()
    const { md5sum } = old
    const stats = {ino}
    const events /*: LocalEvent[] */ = [
      {type: 'unlink', path: oldPath, old},
      {type: 'add', path: newPath, stats, md5sum, old}
    ]
    const pendingChanges = []

    should(analysis(events, pendingChanges)).deepEqual([{
      sideName,
      type: 'FileAddition',
      path: newPath,
      ino,
      md5sum,
      stats,
      old
    }])
  })

  it('handles unlink+add+change', () => {
    const old /*: Metadata */ = metadataBuilders.file().ino(1).build()
    const stats = {ino: 1}
    const events /*: LocalEvent[] */ = [
      {type: 'unlink', path: 'src', old},
      {type: 'add', path: 'dst', stats, md5sum: old.md5sum},
      {type: 'change', path: 'dst', stats, md5sum: 'yata'}
    ]
    const pendingChanges /*: LocalChange[] */ = []

    should(analysis(events, pendingChanges)).deepEqual([{
      sideName,
      type: 'FileMove',
      path: 'dst',
      md5sum: old.md5sum,
      ino: 1,
      stats,
      old,
      update: {
        type: 'change',
        path: 'dst',
        stats,
        md5sum: 'yata'
      }
    }])
    should(pendingChanges).deepEqual([])
  })

  it('does not mistakenly identifies a partial file addition + a file change on same inode as an identical renaming', () => {
    const partiallyAddedPath = 'partially-added-file'
    const changedPath = 'changed-file'
    const old = metadataBuilders.file().path(changedPath).ino(111).build()
    const ino = 222
    const md5sum = 'changedSum'
    const events /*: LocalEvent[] */ = [
      {type: 'add', path: partiallyAddedPath, stats: {ino}, old: null, wip: true},
      // In real life, the partially-added-file would be unlinked here.
      // But this would defeat the purpose of reproducing this issue.
      // So let's assume it was not.
      {type: 'change', path: changedPath, stats: {ino}, md5sum, old}
    ]
    const pendingChanges /*: LocalChange[] */ = []

    const changes = analysis(events, pendingChanges)

    should({changes, pendingChanges}).deepEqual({
      changes: [
        {
          sideName,
          type: 'FileUpdate',
          path: changedPath,
          stats: {ino},
          ino,
          md5sum,
          old
        }
      ],
      pendingChanges: [
        // In real life, the temporary file should have been ignored.
        // Here, since it has the same inode as the change event, is is overridden.
        // So no pending change in the end.
      ]
    })
  })

  it('does not mistakenly identifies a partial dir addition + another on same inode as identical renaming', () => {
    const partiallyAddedPath = 'partially-added-dir'
    const newAddedPath = 'new-added-dir'
    const ino = 123
    const events /*: LocalEvent[] */ = [
      {type: 'addDir', path: partiallyAddedPath, stats: {ino}, old: null, wip: true},
      // In real life, it should not happen so often that two addDir events
      // follow without an intermediate unlinkDir one.
      // But lets assume it happens in order to reproduce this issue.
      {type: 'addDir', path: newAddedPath, stats: {ino}, old: null} // not wip because dir still exists
    ]
    const pendingChanges /*: LocalChange[] */ = []

    const changes = analysis(events, pendingChanges)

    should({changes, pendingChanges}).deepEqual({
      changes: [
        {
          sideName,
          type: 'DirAddition',
          path: newAddedPath,
          stats: {ino},
          ino
        }
      ],
      pendingChanges: [
        // In real life, a dir addition+move analysis would identify only the
        // addition of the destination.
        // Here, since both addDir events have the same inode, first one is overridden.
        // So no pending change in the end.
      ]
    })
  })

  it('identifies add({path: FOO, ino: 1}) + change({path: foo, ino: 1}) as FileMove(foo, FOO)', () => {
    const old /*: Metadata */ = metadataBuilders.file().path('foo').ino(1).build()
    const stats = {ino: 1}
    const { md5sum } = old
    const events /*: LocalEvent[] */ = [
      {type: 'add', path: 'FOO', stats, old, md5sum},
      {type: 'change', path: 'foo', stats, old, md5sum}
    ]
    const pendingChanges = []

    should(analysis(events, pendingChanges)).deepEqual([{
      sideName,
      update: {
        md5sum,
        old,
        path: 'FOO',
        stats,
        type: 'change'
      },
      type: 'FileMove',
      path: 'FOO',
      ino: 1,
      stats,
      old,
      md5sum
    }])
  })

  it('handles unlinkDir+addDir', () => {
    const old /*: Metadata */ = metadataBuilders.dir().ino(1).build()
    const stats = {ino: 1}
    const events /*: LocalEvent[] */ = [
      {type: 'unlinkDir', path: 'src', old},
      {type: 'addDir', path: 'dst', stats}
    ]
    const pendingChanges /*: LocalChange[] */ = []

    should(analysis(events, pendingChanges)).deepEqual([{
      sideName,
      type: 'DirMove',
      path: 'dst',
      ino: 1,
      stats,
      old
    }])
    should(pendingChanges).deepEqual([])
  })

  it('handles unlinkDir(x,old=X)+addDir(X,old=X) (identical renaming loopback) as DirAddition(X) because we lack an x doc to build DirMove(x → X)', () => {
    const ino = 1
    const oldPath = 'x'
    const newPath = 'X'
    const old /*: Metadata */ = metadataBuilders.dir().path(newPath).ino(ino).build()
    const stats = {ino}
    const events /*: LocalEvent[] */ = [
      {type: 'unlinkDir', path: oldPath, old},
      {type: 'addDir', path: newPath, stats, old}
    ]
    const pendingChanges = []

    should(analysis(events, pendingChanges)).deepEqual([{
      sideName,
      type: 'DirAddition',
      path: newPath,
      ino,
      stats,
      old
    }])
  })

  it('identifies unlink+add then unlink (incomplete move then deletion) as FileDeletion', () => {
    const old /*: Metadata */ = metadataBuilders.file().path('src').ino(1).build()
    const stats = {ino: 1}
    const events /*: LocalEvent[] */ = [
      {type: 'unlink', path: 'src', old},
      {type: 'add', path: 'dst1', stats, wip: true}
    ]
    const pendingChanges /*: LocalChange[] */ = []

    should(analysis(events, pendingChanges)).deepEqual([])
    should(pendingChanges).deepEqual([{
      sideName,
      type: 'FileMove',
      path: 'dst1',
      ino: 1,
      stats,
      old,
      wip: true
    }])

    const nextEvents /*: LocalEvent[] */ = [
      {type: 'unlink', path: 'dst1'}
    ]
    should(analysis(nextEvents, pendingChanges)).deepEqual([{
      sideName,
      type: 'FileDeletion',
      ino: 1,
      path: 'src',
      old
    }])
    should(pendingChanges).deepEqual([])
  })

  it('identifies add({path: FOO, stats: {ino}, old: {path: foo, ino}}) as offline FileMove(foo, FOO)', () => {
    const ino = 123
    const stats = {ino}
    const md5sum = 'badbeef'
    const old = {path: 'foo', ino}
    const events /*: LocalEvent[] */ = [
      {type: 'add', path: 'FOO', md5sum, stats, old}
    ]
    const pendingChanges /*: LocalChange[] */ = []

    should(analysis(events, pendingChanges)).deepEqual([{
      sideName,
      type: 'FileMove',
      path: 'FOO',
      md5sum,
      ino,
      stats,
      old
    }])
    should(pendingChanges).deepEqual([])
  })

  it('handles addDir', () => {
    const stats = {ino: 1}
    const events /*: LocalEvent[] */ = [
      {type: 'addDir', path: 'foo', stats}
    ]
    const pendingChanges /*: LocalChange[] */ = []

    should(analysis(events, pendingChanges)).deepEqual([{
      sideName,
      type: 'DirAddition',
      path: 'foo',
      ino: 1,
      stats
    }])
    should(pendingChanges).deepEqual([])
  })

  it('ignores a file added+deleted (e.g. temporary file)', () => {
    const path = 'whatever'
    const ino = 532806
    const stats = {ino}
    const events /*: LocalEvent[] */ = [
      {type: 'add', path, stats, old: null, wip: true},
      {type: 'unlink', path, old: null}
    ]
    const pendingChanges /*: LocalChange[] */ = []

    const changes = analysis(events, pendingChanges)
    should({changes, pendingChanges}).deepEqual({
      changes: [
        {
          sideName,
          type: 'Ignored',
          path,
          ino,
          stats
        }
      ],
      pendingChanges: []
    })
  })

  it('handles addDir+unlinkDir', () => {
    const old /*: Metadata */ = metadataBuilders.dir().ino(1).build()
    const stats = {ino: 1}
    const events /*: LocalEvent[] */ = [
      {type: 'addDir', path: 'dst', stats},
      {type: 'unlinkDir', path: 'src', old}
    ]
    const pendingChanges /*: LocalChange[] */ = []

    should(analysis(events, pendingChanges)).deepEqual([{
      sideName,
      type: 'DirMove',
      path: 'dst',
      ino: 1,
      stats,
      old
    }])
    should(pendingChanges).deepEqual([])
  })

  it('identifies 2 successive addDir on same path/ino but different stats as DirAddition(foo/) with the last stats', () => {
    const path = 'foo'
    const ino = 1
    const old /*: Metadata */ = metadataBuilders.dir().path(path).ino(ino).build()
    const stats1 = {ino, size: 64}
    const stats2 = {ino, size: 1312}
    const events /*: LocalEvent[] */ = [
      {type: 'addDir', path, stats: stats1, old},
      {type: 'addDir', path, stats: stats2, old}
    ]
    const pendingChanges = []

    should(analysis(events, pendingChanges)).deepEqual([{
      sideName,
      type: 'DirAddition',
      path,
      ino,
      stats: stats2,
      old
    }])
  })

  it('identifies addDir({path: foo, ino: 1}) + addDir({path: FOO, ino: 1}) as DirMove(foo, FOO)', () => {
    const old /*: Metadata */ = metadataBuilders.dir().path('foo').ino(1).build()
    const stats = {ino: 1}
    const events /*: LocalEvent[] */ = [
      {type: 'addDir', path: 'foo', stats, old},
      {type: 'addDir', path: 'FOO', stats, old}
    ]
    const pendingChanges = []

    should(analysis(events, pendingChanges)).deepEqual([{
      sideName,
      type: 'DirMove',
      path: 'FOO',
      ino: 1,
      stats,
      old
    }])
  })

  it('identifies addDir({path: FOO, stats: {ino}, old: {path: foo, ino}}) as offline DirMove(foo, FOO)', () => {
    const ino = 456
    const stats = {ino}
    const old = {path: 'foo', ino}
    const events /*: LocalEvent[] */ = [
      {type: 'addDir', path: 'FOO', stats, old}
    ]
    const pendingChanges /*: LocalChange[] */ = []

    should(analysis(events, pendingChanges)).deepEqual([{
      sideName,
      type: 'DirMove',
      path: 'FOO',
      ino,
      stats,
      old
    }])
    should(pendingChanges).deepEqual([])
  })

  it('handles chokidar mistakes', () => {
    const old /*: Metadata */ = metadataBuilders.file().ino(1).build()
    const stats = {ino: 1}
    const events /*: LocalEvent[] */ = [
      {type: 'unlinkDir', path: 'src', old},
      {type: 'add', path: 'dst', stats, md5sum: 'yolo'}
    ]
    const pendingChanges /*: LocalChange[] */ = []
    should(analysis(events, pendingChanges)).deepEqual([
      {
        sideName,
        type: 'FileMove',
        md5sum: 'yolo',
        path: 'dst',
        ino: 1,
        stats,
        old
      }
    ])
  })

  it('sorts actions', () => {
    const dirStats = {ino: 1}
    const subdirStats = {ino: 2}
    const fileStats = {ino: 3}
    const otherFileStats = {ino: 4}
    const otherDirStats = {ino: 5}
    const dirMetadata /*: Metadata */ = metadataBuilders.dir().ino(dirStats.ino).build()
    const subdirMetadata /*: Metadata */ = metadataBuilders.dir().ino(subdirStats.ino).build()
    const fileMetadata  /*: Metadata */ = metadataBuilders.file().ino(fileStats.ino).build()
    const otherFileMetadata  /*: Metadata */ = metadataBuilders.file().ino(otherFileStats.ino).build()
    const otherDirMetadata  /*: Metadata */ = metadataBuilders.dir().ino(otherDirStats.ino).build()
    const events /*: LocalEvent[] */ = [
      {type: 'unlinkDir', path: 'src/subdir', old: subdirMetadata},
      {type: 'unlinkDir', path: 'src', old: dirMetadata},
      {type: 'addDir', path: 'dst', stats: dirStats},
      {type: 'addDir', path: 'dst/subdir', stats: subdirStats},
      {type: 'unlink', path: 'src/file', old: fileMetadata},
      {type: 'add', path: 'dst/file', stats: fileStats},
      {type: 'change', path: 'other-file', stats: otherFileStats, md5sum: 'yolo', old: otherFileMetadata},
      {type: 'unlinkDir', path: 'other-dir-src', old: otherDirMetadata},
      {type: 'addDir', path: 'other-dir-dst', stats: otherDirStats}
    ]
    const pendingChanges /*: LocalChange[] */ = []

    should(analysis(events, pendingChanges)).deepEqual([
      {sideName, type: 'FileUpdate', path: 'other-file', stats: otherFileStats, ino: otherFileStats.ino, md5sum: 'yolo', old: otherFileMetadata},
      {sideName, type: 'DirMove', path: 'dst', stats: dirStats, ino: dirStats.ino, old: dirMetadata},
      // FIXME: Move should have been squashed
      {sideName, type: 'FileMove', path: 'dst/file', stats: fileStats, ino: fileStats.ino, old: fileMetadata},
      {sideName, type: 'DirMove', path: 'dst/subdir', stats: subdirStats, ino: subdirStats.ino, old: subdirMetadata},
      {sideName, type: 'DirMove', path: 'other-dir-dst', stats: otherDirStats, ino: otherDirStats.ino, old: otherDirMetadata}
    ])
  })
})

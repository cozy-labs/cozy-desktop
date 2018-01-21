/* eslint-env mocha */

import should from 'should'

import sortAndSquash from '../../../core/local/sortandsquash'

import MetadataBuilders from '../../builders/metadata'

import type { LocalEvent } from '../../../core/local/event'
import type { PrepAction } from '../../../core/local/prep_action'
import type { Metadata } from '../../../core/metadata'

describe('SortAndSquash Unit Tests', function () {
  let metadataBuilders

  before(() => { metadataBuilders = new MetadataBuilders() })

  it('do not break on empty array', () => {
    const events: LocalEvent[] = []
    const pendingActions: PrepAction[] = []
    const result: PrepAction[] = sortAndSquash(events, pendingActions)
    should(result).have.length(0)
  })

  it('handles partial successive moves (add+unlink+add, then unlink later)', () => {
    const old: Metadata = metadataBuilders.file().ino(1).build()
    const stats = {ino: 1}
    const events: LocalEvent[] = [
      {type: 'add', path: 'dst1', stats, wip: true},
      {type: 'unlink', path: 'src', old},
      {type: 'add', path: 'dst2', stats, md5sum: 'yolo'}
    ]
    const pendingActions: PrepAction[] = []

    should(sortAndSquash(events, pendingActions)).deepEqual([{
      type: 'PrepMoveFile',
      path: 'dst2',
      ino: 1,
      md5sum: 'yolo',
      stats,
      old
    }])
    should(pendingActions).deepEqual([])

    const nextEvents: LocalEvent[] = [
      {type: 'unlink', path: 'dst1'}
    ]
    should(sortAndSquash(nextEvents, pendingActions)).deepEqual([])
    should(pendingActions).deepEqual([])
  })

  it('handles unlink+add', () => {
    const old: Metadata = metadataBuilders.file().ino(1).build()
    const stats = {ino: 1}
    const events: LocalEvent[] = [
      {type: 'unlink', path: 'src', old},
      {type: 'add', path: 'dst', stats, md5sum: 'yolo'}
    ]
    const pendingActions: PrepAction[] = []

    should(sortAndSquash(events, pendingActions)).deepEqual([{
      type: 'PrepMoveFile',
      path: 'dst',
      md5sum: 'yolo',
      ino: 1,
      stats,
      old
    }])
    should(pendingActions).deepEqual([])
  })

  it('handles unlinkDir+addDir', () => {
    const old: Metadata = metadataBuilders.dir().ino(1).build()
    const stats = {ino: 1}
    const events: LocalEvent[] = [
      {type: 'unlinkDir', path: 'src', old},
      {type: 'addDir', path: 'dst', stats}
    ]
    const pendingActions: PrepAction[] = []

    should(sortAndSquash(events, pendingActions)).deepEqual([{
      type: 'PrepMoveFolder',
      path: 'dst',
      ino: 1,
      stats,
      old
    }])
    should(pendingActions).deepEqual([])
  })

  it('handles partial successive moves (add+unlink+add, then unlink later)', () => {
    const old: Metadata = metadataBuilders.file().path('src').ino(1).build()
    const stats = {ino: 1}
    const events: LocalEvent[] = [
      {type: 'unlink', path: 'src', old},
      {type: 'add', path: 'dst1', stats, wip: true}
    ]
    const pendingActions: PrepAction[] = []

    should(sortAndSquash(events, pendingActions)).deepEqual([])
    should(pendingActions).deepEqual([{
      type: 'PrepMoveFile',
      path: 'dst1',
      ino: 1,
      stats,
      old,
      wip: true
    }])

    const nextEvents: LocalEvent[] = [
      {type: 'unlink', path: 'dst1'}
    ]
    should(sortAndSquash(nextEvents, pendingActions)).deepEqual([{
      type: 'PrepDeleteFile',
      ino: 1,
      path: 'src',
      old
    }])
    should(pendingActions).deepEqual([])
  })

  it('handles addDir', () => {
    const stats = {ino: 1}
    const events: LocalEvent[] = [
      {type: 'addDir', path: 'foo', stats}
    ]
    const pendingActions: PrepAction[] = []

    should(sortAndSquash(events, pendingActions)).deepEqual([{
      type: 'PrepPutFolder',
      path: 'foo',
      ino: 1,
      stats
    }])
    should(pendingActions).deepEqual([])
  })

  it('handles addDir+unlinkDir', () => {
    const old: Metadata = metadataBuilders.dir().ino(1).build()
    const stats = {ino: 1}
    const events: LocalEvent[] = [
      {type: 'addDir', path: 'dst', stats},
      {type: 'unlinkDir', path: 'src', old}
    ]
    const pendingActions: PrepAction[] = []

    should(sortAndSquash(events, pendingActions)).deepEqual([{
      type: 'PrepMoveFolder',
      path: 'dst',
      ino: 1,
      stats,
      old
    }])
    should(pendingActions).deepEqual([])
  })

  it('sorts actions', () => {
    const dirStats = {ino: 1}
    const subdirStats = {ino: 2}
    const fileStats = {ino: 3}
    const otherFileStats = {ino: 4}
    const otherDirStats = {ino: 5}
    const dirMetadata: Metadata = metadataBuilders.dir().ino(dirStats.ino).build()
    const subdirMetadata: Metadata = metadataBuilders.dir().ino(subdirStats.ino).build()
    const fileMetadata : Metadata = metadataBuilders.file().ino(fileStats.ino).build()
    const otherFileMetadata : Metadata = metadataBuilders.file().ino(otherFileStats.ino).build()
    const otherDirMetadata : Metadata = metadataBuilders.dir().ino(otherDirStats.ino).build()
    const events: LocalEvent[] = [
      {type: 'unlinkDir', path: 'src/subdir', old: subdirMetadata},
      {type: 'unlinkDir', path: 'src', old: dirMetadata},
      {type: 'addDir', path: 'dst', stats: dirStats},
      {type: 'addDir', path: 'dst/subdir', stats: subdirStats},
      {type: 'unlink', path: 'src/file', old: fileMetadata},
      {type: 'add', path: 'dst/file', stats: fileStats},
      {type: 'change', path: 'other-file', stats: otherFileStats, md5sum: 'yolo', old: otherFileMetadata},
      {type: 'unlinkDir', path: 'other-dir-src', old: otherDirMetadata},
      {type: 'addDir', path: 'other-dir-dst', stats: otherDirStats},
    ]
    const pendingActions: PrepAction[] = []

    should(sortAndSquash(events, pendingActions)).deepEqual([
      {type: 'PrepUpdateFile', path: 'other-file', stats: otherFileStats, ino: otherFileStats.ino, md5sum: 'yolo', /* FIXME: */ wip: undefined},
      {type: 'PrepMoveFolder', path: 'dst', stats: dirStats, ino: dirStats.ino, old: dirMetadata},
      // FIXME: Move should have been squashed
      {type: 'PrepMoveFile', path: 'dst/file', stats: fileStats, ino: fileStats.ino, old: fileMetadata},
      {type: 'PrepMoveFolder', path: 'dst/subdir', stats: subdirStats, ino: subdirStats.ino, old: subdirMetadata},
      {type: 'PrepMoveFolder', path: 'other-dir-dst', stats: otherDirStats, ino: otherDirStats.ino, old: otherDirMetadata}
    ])
  })
})

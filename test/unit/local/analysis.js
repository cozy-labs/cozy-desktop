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

  it('handles partial successive moves (add+unlink+add, then unlink later)', () => {
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
      {sideName, type: 'FileUpdate', path: 'other-file', stats: otherFileStats, ino: otherFileStats.ino, md5sum: 'yolo', old: otherFileMetadata, /* FIXME: */ wip: undefined},
      {sideName, type: 'DirMove', path: 'dst', stats: dirStats, ino: dirStats.ino, old: dirMetadata},
      // FIXME: Move should have been squashed
      {sideName, type: 'FileMove', path: 'dst/file', stats: fileStats, ino: fileStats.ino, old: fileMetadata},
      {sideName, type: 'DirMove', path: 'dst/subdir', stats: subdirStats, ino: subdirStats.ino, old: subdirMetadata},
      {sideName, type: 'DirMove', path: 'other-dir-dst', stats: otherDirStats, ino: otherDirStats.ino, old: otherDirMetadata}
    ])
  })
})

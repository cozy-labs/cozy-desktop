/* eslint-env mocha */

import should from 'should'

import sortAndSquash from '../../../core/local/sortandsquash'

import MetadataBuilders from '../../builders/metadata'

import type { ContextualizedChokidarFSEvent } from '../../../core/local/chokidar_event'
import type { PrepAction } from '../../../core/local/prep_action'
import type { Metadata } from '../../../core/metadata'

describe('SortAndSquash Unit Tests', function () {
  let metadataBuilders

  before(() => { metadataBuilders = new MetadataBuilders() })

  it('do not break on empty array', () => {
    const events: ContextualizedChokidarFSEvent[] = []
    const pendingActions: PrepAction[] = []
    const result: PrepAction[] = sortAndSquash(events, pendingActions)
    should(result).have.length(0)
  })

  it('handles partial successive moves (add+unlink+add, then unlink later)', () => {
    const old: Metadata = metadataBuilders.file().ino(1).build()
    const stats = {ino: 1}
    const events: ContextualizedChokidarFSEvent[] = [
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

    const nextEvents: ContextualizedChokidarFSEvent[] = [
      {type: 'unlink', path: 'dst1'}
    ]
    should(sortAndSquash(nextEvents, pendingActions)).deepEqual([])
    should(pendingActions).deepEqual([])
  })

  it('handles unlink+add', () => {
    const old: Metadata = metadataBuilders.file().ino(1).build()
    const stats = {ino: 1}
    const events: ContextualizedChokidarFSEvent[] = [
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
    const events: ContextualizedChokidarFSEvent[] = [
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
    const events: ContextualizedChokidarFSEvent[] = [
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

    const nextEvents: ContextualizedChokidarFSEvent[] = [
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
})

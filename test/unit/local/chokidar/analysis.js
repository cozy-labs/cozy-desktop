/* eslint-env mocha */

const _ = require('lodash')
const should = require('should')
const path = require('path')

const analysis = require('../../../../core/local/chokidar/analysis')

const Builders = require('../../../support/builders')

/*::
import type { LocalEvent } from '../../../../core/local/chokidar/local_event'
import type { LocalChange } from '../../../../core/local/chokidar/local_change'
import type { Metadata } from '../../../../core/metadata'
*/

describe('core/local/chokidar/analysis', function() {
  const sideName = 'local'
  const builders = new Builders()

  describe('No change', () => {
    describe('empty event list', () => {
      it('may happen when all events were dropped', () => {
        const events /*: LocalEvent[] */ = []
        const pendingChanges /*: LocalChange[] */ = []
        const result /*: LocalChange[] */ = analysis(events, { pendingChanges })
        should(result).have.length(0)
      })
    })

    describe('add(x) + unlink(x)', () => {
      it('is ignored as a temporarily added then deleted file', () => {
        const path = 'whatever'
        const ino = 532806
        const stats = { ino }
        const events /*: LocalEvent[] */ = [
          { type: 'add', path, stats, old: null, wip: true },
          { type: 'unlink', path, old: null }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        const changes = analysis(events, { pendingChanges })
        should({ changes, pendingChanges }).deepEqual({
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
    })
  })

  describe('DirAddition(x)', () => {
    describe('addDir(x)', () => {
      it('is the most common case', () => {
        const stats = { ino: 1 }
        const events /*: LocalEvent[] */ = [
          { type: 'addDir', path: 'foo', stats }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        should(analysis(events, { pendingChanges })).deepEqual([
          {
            sideName,
            type: 'DirAddition',
            path: 'foo',
            ino: 1,
            stats
          }
        ])
        should(pendingChanges).deepEqual([])
      })
    })

    describe('addDir(x) + addDir(x)', () => {
      it('is has the last stats', () => {
        const path = 'foo'
        const ino = 1
        const old /*: Metadata */ = builders
          .metadir()
          .path(path)
          .ino(ino)
          .build()
        const stats1 = { ino, size: 64 }
        const stats2 = { ino, size: 1312 }
        const events /*: LocalEvent[] */ = [
          { type: 'addDir', path, stats: stats1, old },
          { type: 'addDir', path, stats: stats2, old }
        ]
        const pendingChanges = []

        should(analysis(events, { pendingChanges })).deepEqual([
          {
            sideName,
            type: 'DirAddition',
            path,
            ino,
            stats: stats2,
            old
          }
        ])
      })
    })

    describe('addDir(y, ino, wip) + addDir(x, ino)', () => {
      it('is is not confused with an identical renaming', () => {
        const partiallyAddedPath = 'partially-added-dir'
        const newAddedPath = 'new-added-dir'
        const ino = 123
        const events /*: LocalEvent[] */ = [
          {
            type: 'addDir',
            path: partiallyAddedPath,
            stats: { ino },
            old: null,
            wip: true
          },
          // In real life, it should not happen so often that two addDir events
          // follow without an intermediate unlinkDir one.
          // But lets assume it happens in order to reproduce this issue.
          { type: 'addDir', path: newAddedPath, stats: { ino }, old: null } // not wip because dir still exists
        ]
        const pendingChanges /*: LocalChange[] */ = []

        const changes = analysis(events, { pendingChanges })

        should({ changes, pendingChanges }).deepEqual({
          changes: [
            {
              sideName,
              type: 'DirAddition',
              path: newAddedPath,
              stats: { ino },
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
    })
  })

  describe('FileDeletion(x)', () => {
    describe('unlink(x) + wip add(y) + flush + unlink(y)', () => {
      it('is a pending move finally resolved to the deletion of the source', () => {
        const old /*: Metadata */ = builders
          .metafile()
          .path('src')
          .ino(1)
          .build()
        const stats = { ino: 1 }
        const events /*: LocalEvent[] */ = [
          { type: 'unlink', path: 'src', old },
          { type: 'add', path: 'dst1', stats, wip: true }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        should(analysis(events, { pendingChanges })).deepEqual([])
        should(pendingChanges).deepEqual([
          {
            sideName,
            type: 'FileMove',
            path: 'dst1',
            ino: 1,
            stats,
            old,
            wip: true
          }
        ])

        const nextEvents /*: LocalEvent[] */ = [
          { type: 'unlink', path: 'dst1' }
        ]
        should(analysis(nextEvents, { pendingChanges })).deepEqual([
          {
            sideName,
            type: 'FileDeletion',
            ino: 1,
            path: 'src',
            old
          }
        ])
        should(pendingChanges).deepEqual([])
      })
    })
  })

  describe('FileMove(src => dst)', () => {
    describe('unlink(src) + add(dst)', () => {
      it('is the most common case', () => {
        const old /*: Metadata */ = builders
          .metafile()
          .ino(1)
          .build()
        const stats = { ino: 1 }
        const { md5sum } = old
        const events /*: LocalEvent[] */ = [
          { type: 'unlink', path: 'src', old },
          { type: 'add', path: 'dst', stats, md5sum }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        should(analysis(events, { pendingChanges })).deepEqual([
          {
            sideName,
            type: 'FileMove',
            path: 'dst',
            md5sum,
            ino: 1,
            stats,
            old
          }
        ])
        should(pendingChanges).deepEqual([])
      })
    })

    describe('unlinkDir(src) + add(dst)', () => {
      it('is a chokidar bug', () => {
        const old /*: Metadata */ = builders
          .metafile()
          .ino(1)
          .build()
        const stats = { ino: 1 }
        const { md5sum } = old
        const events /*: LocalEvent[] */ = [
          { type: 'unlinkDir', path: 'src', old },
          { type: 'add', path: 'dst', stats, md5sum }
        ]
        const pendingChanges /*: LocalChange[] */ = []
        should(analysis(events, { pendingChanges })).deepEqual([
          {
            sideName,
            type: 'FileMove',
            md5sum,
            path: 'dst',
            ino: 1,
            stats,
            old
          }
        ])
      })
    })

    describe('add(tmp) + unlink(src) + add(dst) + flush + unlink(tmp)', () => {
      it('is already complete on first flush', () => {
        const old /*: Metadata */ = builders
          .metafile()
          .ino(1)
          .build()
        const stats = { ino: 1 }
        const { md5sum } = old
        const events /*: LocalEvent[] */ = [
          { type: 'add', path: 'dst1', stats, wip: true },
          { type: 'unlink', path: 'src', old },
          { type: 'add', path: 'dst2', stats, md5sum }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        should(analysis(events, { pendingChanges })).deepEqual([
          {
            sideName,
            type: 'FileMove',
            path: 'dst2',
            ino: 1,
            md5sum,
            stats,
            old
          }
        ])
        should(pendingChanges).deepEqual([])

        const nextEvents /*: LocalEvent[] */ = [
          { type: 'unlink', path: 'dst1' }
        ]
        should(analysis(nextEvents, { pendingChanges })).deepEqual([])
        should(pendingChanges).deepEqual([])
      })
    })

    describe('unlink(src) + add(tmp) + dropped unlink(tmp) + wip add(dst)', () => {
      it('is incomplete', () => {
        const old /*: Metadata */ = builders
          .metafile()
          .ino(1)
          .build()
        const stats = { ino: 1 }
        const events /*: LocalEvent[] */ = [
          { type: 'unlink', path: 'src', old },
          { type: 'add', path: 'dst1', stats, md5sum: old.md5sum },
          // dropped: {type: 'unlink', path: 'dst1', old},
          { type: 'add', path: 'dst2', stats, wip: true }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        should(analysis(events, { pendingChanges })).deepEqual([])
        should(pendingChanges).deepEqual([
          {
            sideName,
            type: 'FileMove',
            path: 'dst2',
            md5sum: undefined,
            ino: 1,
            wip: true,
            stats,
            old
          }
        ])
      })
    })

    describe('unlink(src) + wip add(tmp) + add(dst)', () => {
      it('is complete', () => {
        const old /*: Metadata */ = builders
          .metafile()
          .ino(1)
          .build()
        const stats = { ino: 1 }
        const { md5sum } = old
        const events /*: LocalEvent[] */ = [
          { type: 'unlink', path: 'src', old },
          { type: 'add', path: 'dst1', stats, wip: true },
          // dropped: {type: 'unlink', path: 'dst1', old},
          { type: 'add', path: 'dst2', stats, md5sum }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        should(analysis(events, { pendingChanges })).deepEqual([
          {
            sideName,
            type: 'FileMove',
            path: 'dst2',
            ino: 1,
            md5sum,
            stats,
            old
          }
        ])
        should(pendingChanges).deepEqual([])
      })
    })
  })

  describe('FileMove.update(src => dst)', () => {
    describe('unlink(src) + add(dst) + change(dst)', () => {
      it('happens when there is sufficient delay betwen move & change', () => {
        const old /*: Metadata */ = builders
          .metafile()
          .ino(1)
          .build()
        const stats = { ino: 1 }
        const events /*: LocalEvent[] */ = [
          { type: 'unlink', path: 'src', old },
          { type: 'add', path: 'dst', stats, md5sum: old.md5sum },
          { type: 'change', path: 'dst', stats, md5sum: 'yata' }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        should(analysis(events, { pendingChanges })).deepEqual([
          {
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
          }
        ])
        should(pendingChanges).deepEqual([])
      })
    })
  })

  describe('FileMove(a => A)', () => {
    describe('add(A) + change(a) on same inode', () => {
      it('is a chokidar bug with weird reversed events on macOS', () => {
        const old /*: Metadata */ = builders
          .metafile()
          .path('foo')
          .ino(1)
          .build()
        const stats = { ino: 1 }
        const { md5sum } = old
        const events /*: LocalEvent[] */ = [
          { type: 'add', path: 'FOO', stats, old, md5sum },
          { type: 'change', path: 'foo', stats, old, md5sum }
        ]
        const pendingChanges = []

        should(analysis(events, { pendingChanges })).deepEqual([
          {
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
          }
        ])
      })
    })

    describe('wip add(b) + change(a)', () => {
      it('is a FileUpdate(a) not to be confused with', () => {
        const partiallyAddedPath = 'partially-added-file'
        const changedPath = 'changed-file'
        const old = builders
          .metafile()
          .path(changedPath)
          .ino(111)
          .build()
        const ino = 222
        const md5sum = 'changedSum'
        const events /*: LocalEvent[] */ = [
          {
            type: 'add',
            path: partiallyAddedPath,
            stats: { ino },
            old: null,
            wip: true
          },
          // In real life, the partially-added-file would be unlinked here.
          // But this would defeat the purpose of reproducing this issue.
          // So let's assume it was not.
          { type: 'change', path: changedPath, stats: { ino }, md5sum, old }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        const changes = analysis(events, { pendingChanges })

        should({ changes, pendingChanges }).deepEqual({
          changes: [
            {
              sideName,
              type: 'FileUpdate',
              path: changedPath,
              stats: { ino },
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
    })

    describe('unwatched add(A, ino, old={a, ino})', () => {
      it('is a case/normalization only change', () => {
        const ino = 123
        const stats = { ino }
        const md5sum = 'badbeef'
        const old = { path: 'foo', ino }
        const events /*: LocalEvent[] */ = [
          { type: 'add', path: 'FOO', md5sum, stats, old }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        should(analysis(events, { pendingChanges })).deepEqual([
          {
            sideName,
            type: 'FileMove',
            path: 'FOO',
            md5sum,
            ino,
            stats,
            old
          }
        ])
        should(pendingChanges).deepEqual([])
      })
    })
  })

  describe('FileAddition(A) instead of FileMove(a => A)', () => {
    describe('unlink(x, old=X) + add(X,old=X)', () => {
      it('is an identical renaming loopback except we lack doc a to build the FileMove from', () => {
        const ino = 1
        const oldPath = 'x'
        const newPath = 'X'
        const old /*: Metadata */ = builders
          .metafile()
          .path(newPath)
          .ino(ino)
          .build()
        const { md5sum } = old
        const stats = { ino }
        const events /*: LocalEvent[] */ = [
          { type: 'unlink', path: oldPath, old },
          { type: 'add', path: newPath, stats, md5sum, old }
        ]
        const pendingChanges = []

        should(analysis(events, { pendingChanges })).deepEqual([
          {
            sideName,
            type: 'FileAddition',
            path: newPath,
            ino,
            md5sum,
            stats,
            old
          }
        ])
      })
    })
  })

  describe('DirMove(src => dst)', () => {
    describe('unlinkDir(src) + addDir(dst)', () => {
      it('is the most common case', () => {
        const old /*: Metadata */ = builders
          .metadir()
          .ino(1)
          .build()
        const stats = { ino: 1 }
        const events /*: LocalEvent[] */ = [
          { type: 'unlinkDir', path: 'src', old },
          { type: 'addDir', path: 'dst', stats }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        should(analysis(events, { pendingChanges })).deepEqual([
          {
            sideName,
            type: 'DirMove',
            path: 'dst',
            ino: 1,
            stats,
            old
          }
        ])
        should(pendingChanges).deepEqual([])
      })
    })

    describe('addDir(dst) + unlinkDir(src)', () => {
      it('may happen with this reversed order on some platforms', () => {
        const old /*: Metadata */ = builders
          .metadir()
          .ino(1)
          .build()
        const stats = { ino: 1 }
        const events /*: LocalEvent[] */ = [
          { type: 'addDir', path: 'dst', stats },
          { type: 'unlinkDir', path: 'src', old }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        should(analysis(events, { pendingChanges })).deepEqual([
          {
            sideName,
            type: 'DirMove',
            path: 'dst',
            ino: 1,
            stats,
            old
          }
        ])
        should(pendingChanges).deepEqual([])
      })
    })

    describe('unlinkDir(src) + wip addDir(tmp) + addDir(dst)', () => {
      it('ignores the intermediate move', () => {
        const old /*: Metadata */ = builders
          .metadir()
          .ino(1)
          .build()
        const stats = { ino: 1 }
        const events /*: LocalEvent[] */ = [
          { type: 'unlinkDir', path: 'src', old },
          { type: 'addDir', path: 'dst1', stats, wip: true },
          // dropped: {type: 'unlinkDir', path: 'dst1', old},
          { type: 'addDir', path: 'dst2', stats }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        should(analysis(events, { pendingChanges })).deepEqual([
          {
            sideName,
            type: 'DirMove',
            path: 'dst2',
            ino: 1,
            stats,
            old
          }
        ])
        should(pendingChanges).deepEqual([])
      })
    })

    describe('unlinkDir(src) + addDir(tmp) + wip addDir(dst)', () => {
      it('is incomplete, waiting for an upcoming unlinkDir(tmp)', () => {
        const old /*: Metadata */ = builders
          .metadir()
          .ino(1)
          .build()
        const stats = { ino: 1 }
        const events /*: LocalEvent[] */ = [
          { type: 'unlinkDir', path: 'src', old },
          { type: 'addDir', path: 'dst1', stats },
          // dropped: {type: 'unlinkDir', path: 'dst1', old},
          { type: 'addDir', path: 'dst2', stats, wip: true }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        should(analysis(events, { pendingChanges })).deepEqual([])
        should(pendingChanges).deepEqual([
          {
            sideName,
            type: 'DirMove',
            path: 'dst2',
            wip: true,
            ino: 1,
            stats,
            old
          }
        ])
      })
    })
  })

  describe('DirMove(a => A)', () => {
    describe('addDir(a, ino) + addDir(A, ino)', () => {
      it('is a case/normalization only change', () => {
        const old /*: Metadata */ = builders
          .metadir()
          .path('foo')
          .ino(1)
          .build()
        const stats = { ino: 1 }
        const events /*: LocalEvent[] */ = [
          { type: 'addDir', path: 'foo', stats, old },
          { type: 'addDir', path: 'FOO', stats, old }
        ]
        const pendingChanges = []

        should(analysis(events, { pendingChanges })).deepEqual([
          {
            sideName,
            type: 'DirMove',
            path: 'FOO',
            ino: 1,
            stats,
            old
          }
        ])
      })
    })

    describe('addDir(A, ino, old={a, ino})', () => {
      it('is an unwatched case/normalization only change', () => {
        const ino = 456
        const stats = { ino }
        const old = { path: 'foo', ino }
        const events /*: LocalEvent[] */ = [
          { type: 'addDir', path: 'FOO', stats, old }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        should(analysis(events, { pendingChanges })).deepEqual([
          {
            sideName,
            type: 'DirMove',
            path: 'FOO',
            ino,
            stats,
            old
          }
        ])
        should(pendingChanges).deepEqual([])
      })
    })
  })

  describe('DirMove(src/ → dst/) + FileUpdate(dst/file)', () => {
    describe('unlinkDir(src/) + addDir (dst/) + unlink(src/file) + add(dst/file) + change(dst/file)', () => {
      it('happens when client is running', () => {
        const dirIno = 1
        const fileIno = 2
        const srcDir /*: Metadata */ = builders
          .metadir()
          .path('src')
          .ino(dirIno)
          .build()
        const srcFile /*: Metadata */ = builders
          .metafile()
          .path(path.normalize('src/file'))
          .ino(fileIno)
          .data('Initial content')
          .build()
        const newMd5sum = builders
          .metafile()
          .data('New content')
          .build().md5sum
        const events /*: LocalEvent[] */ = [
          { type: 'unlinkDir', path: 'src', old: srcDir },
          { type: 'addDir', path: 'dst', stats: { ino: dirIno } },
          { type: 'unlink', path: path.normalize('src/file'), old: srcFile },
          {
            type: 'add',
            path: path.normalize('dst/file'),
            stats: { ino: fileIno },
            md5sum: srcFile.md5sum
          },
          {
            type: 'change',
            path: path.normalize('dst/file'),
            stats: { ino: fileIno },
            md5sum: newMd5sum
          }
        ]
        const pendingChanges = []
        should(analysis(events, { pendingChanges })).deepEqual([
          {
            sideName,
            type: 'DirMove',
            path: 'dst',
            ino: dirIno,
            stats: { ino: dirIno },
            old: srcDir,
            wip: undefined // FIXME: Remove useless wip key
          },
          {
            sideName,
            type: 'FileUpdate',
            path: path.normalize('dst/file'),
            ino: fileIno,
            stats: { ino: fileIno },
            md5sum: newMd5sum,
            old: _.defaults({ path: path.normalize('dst/file') }, srcFile),
            needRefetch: true
          }
        ])
        should(pendingChanges).deepEqual([])
      })
    })

    describe('unlinkDir(src/) + addDir (dst/) + unlink(src/file) + add(dst/file, new md5sum)', () => {
      it('happened when client was stopped (unlink* events are made up)', () => {
        const dirIno = 1
        const fileIno = 2
        const srcDir /*: Metadata */ = builders
          .metadir()
          .path('src')
          .ino(dirIno)
          .build()
        const srcFile /*: Metadata */ = builders
          .metafile()
          .path(path.normalize('src/file'))
          .ino(fileIno)
          .data('Initial content')
          .build()
        const newMd5sum = builders
          .metafile()
          .data('New content')
          .build().md5sum
        const events /*: LocalEvent[] */ = [
          { type: 'unlinkDir', path: 'src', old: srcDir },
          { type: 'addDir', path: 'dst', stats: { ino: dirIno } },
          { type: 'unlink', path: path.normalize('src/file'), old: srcFile },
          {
            type: 'add',
            path: path.normalize('dst/file'),
            stats: { ino: fileIno },
            md5sum: newMd5sum
          }
        ]
        const pendingChanges = []
        should(analysis(events, { pendingChanges })).deepEqual([
          {
            sideName,
            type: 'DirMove',
            path: 'dst',
            ino: dirIno,
            stats: { ino: dirIno },
            old: srcDir,
            wip: undefined // FIXME: Remove useless wip key
          },
          {
            sideName,
            type: 'FileUpdate',
            path: path.normalize('dst/file'),
            ino: fileIno,
            stats: { ino: fileIno },
            md5sum: newMd5sum,
            old: _.defaults({ path: path.normalize('dst/file') }, srcFile),
            needRefetch: true
          }
        ])
        should(pendingChanges).deepEqual([])
      })
    })
  })

  describe('DirAddition(A) instead of DirMove(a => A)', () => {
    describe('unlinkDir(a,old) + addDir(A, old)', () => {
      it('is an identical renaming loopback except we lack doc a to build DirMove(a → A)', () => {
        const ino = 1
        const oldPath = 'x'
        const newPath = 'X'
        const old /*: Metadata */ = builders
          .metadir()
          .path(newPath)
          .ino(ino)
          .build()
        const stats = { ino }
        const events /*: LocalEvent[] */ = [
          { type: 'unlinkDir', path: oldPath, old },
          { type: 'addDir', path: newPath, stats, old }
        ]
        const pendingChanges = []

        should(analysis(events, { pendingChanges })).deepEqual([
          {
            sideName,
            type: 'DirAddition',
            path: newPath,
            ino,
            stats,
            old
          }
        ])
      })
    })
  })

  describe('Sorting', () => {
    describe('using the initial scan sorter', () => {
      it('sorts correctly move a to b + add b/child', () => {
        const dirStats = { ino: 3 }
        const dir = builders
          .metadir()
          .path('src/dir')
          .ino(dirStats.ino)
          .build()

        const events /*: LocalEvent[] */ = [
          { type: 'unlinkDir', path: dir.path, old: dir },
          { type: 'addDir', path: 'dst', stats: { ino: 1 } },
          { type: 'addDir', path: 'src', stats: { ino: 2 } },
          { type: 'addDir', path: 'dst/dir', stats: dirStats },
          { type: 'addDir', path: 'dst/dir/childDir', stats: { ino: 4 } }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        const changes = analysis(events, { pendingChanges, initialScan: true })
        changes
          .map(change => [change.type, change.path])
          .should.deepEqual([
            ['DirAddition', 'dst'],
            ['DirMove', 'dst/dir'],
            ['DirAddition', 'dst/dir/childDir'],
            ['DirAddition', 'src']
          ])
      })
    })

    describe('using the default sorter', () => {
      it('sorts correctly unlink + add + move dir', () => {
        const dirStats = { ino: 1 }
        const fileStats = { ino: 2 }
        const newFileStats = { ino: 3 }

        const oldDirPath = 'root/src/dir'
        const oldFilePath = 'root/src/dir/file.rtf'
        const newDirPath = 'root/dir'
        const newFilePath = 'root/dir/file.rtf'

        const dirMetadata /*: Metadata */ = builders
          .metadir()
          .path(oldDirPath)
          .ino(dirStats.ino)
          .build()
        const fileMetadata /*: Metadata */ = builders
          .metafile()
          .path(oldFilePath)
          .ino(fileStats.ino)
          .build()

        const events /*: LocalEvent[] */ = [
          { type: 'addDir', path: newDirPath, stats: dirStats },
          { type: 'add', path: newFilePath, stats: newFileStats },
          { type: 'unlinkDir', path: oldDirPath, old: dirMetadata },
          { type: 'unlink', path: oldFilePath, old: fileMetadata }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        const changes = analysis(events, { pendingChanges })
        changes
          .map(change => change.type)
          .should.deepEqual(['DirMove', 'FileAddition', 'FileDeletion'])
      })

      it('sorts actions', () => {
        const normalizer = x => {
          x.path = path.normalize(x.path)
          if (x.old) x.old.path = path.normalize(x.old.path)
          return x
        }

        const dirStats = { ino: 1 }
        const subdirStats = { ino: 2 }
        const fileStats = { ino: 3 }
        const otherFileStats = { ino: 4 }
        const otherDirStats = { ino: 5 }
        const dirMetadata /*: Metadata */ = normalizer(
          builders
            .metadir()
            .path('src')
            .ino(dirStats.ino)
            .build()
        )
        const subdirMetadata /*: Metadata */ = normalizer(
          builders
            .metadir()
            .path('src/subdir')
            .ino(subdirStats.ino)
            .build()
        )
        const fileMetadata /*: Metadata */ = normalizer(
          builders
            .metafile()
            .path('src/file')
            .ino(fileStats.ino)
            .build()
        )
        const otherFileMetadata /*: Metadata */ = normalizer(
          builders
            .metafile()
            .path('other-file')
            .ino(otherFileStats.ino)
            .build()
        )
        const otherDirMetadata /*: Metadata */ = normalizer(
          builders
            .metadir()
            .path('other-dir-src')
            .ino(otherDirStats.ino)
            .build()
        )
        const events /*: LocalEvent[] */ = [
          { type: 'unlinkDir', path: 'src/subdir', old: subdirMetadata },
          { type: 'unlinkDir', path: 'src', old: dirMetadata },
          { type: 'addDir', path: 'dst', stats: dirStats },
          { type: 'addDir', path: 'dst/subdir', stats: subdirStats },
          { type: 'unlink', path: 'src/file', old: fileMetadata },
          { type: 'add', path: 'dst/file', stats: fileStats },
          {
            type: 'change',
            path: 'other-file',
            stats: otherFileStats,
            md5sum: 'yolo',
            old: otherFileMetadata
          },
          { type: 'unlinkDir', path: 'other-dir-src', old: otherDirMetadata },
          { type: 'addDir', path: 'other-dir-dst', stats: otherDirStats }
        ].map(normalizer)
        const pendingChanges /*: LocalChange[] */ = []

        should(analysis(events, { pendingChanges })).deepEqual([
          {
            sideName,
            type: 'DirMove',
            path: 'dst',
            stats: dirStats,
            ino: dirStats.ino,
            old: dirMetadata,
            wip: undefined
          },
          {
            sideName,
            type: 'DirMove',
            path: 'other-dir-dst',
            stats: otherDirStats,
            ino: otherDirStats.ino,
            old: otherDirMetadata
          },
          {
            sideName,
            type: 'FileUpdate',
            path: 'other-file',
            stats: otherFileStats,
            ino: otherFileStats.ino,
            md5sum: 'yolo',
            old: otherFileMetadata
          }
        ])
      })
    })
  })
})

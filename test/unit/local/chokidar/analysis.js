/* eslint-env mocha */

const _ = require('lodash')
const should = require('should')
const path = require('path')

const analysis = require('../../../../core/local/chokidar/analysis')

const Builders = require('../../../support/builders')
const { onPlatform } = require('../../../support/helpers/platform')

/*::
import type { LocalEvent } from '../../../../core/local/chokidar/local_event'
import type { LocalChange } from '../../../../core/local/chokidar/local_change'
import type { Metadata } from '../../../../core/metadata'
*/

onPlatform('darwin', () => {
  describe('core/local/chokidar/analysis', function () {
    const sideName = 'local'
    const builders = new Builders()

    describe('No change', () => {
      describe('empty event list', () => {
        it('may happen when all events were dropped', () => {
          const events /*: LocalEvent[] */ = []
          const pendingChanges /*: LocalChange[] */ = []
          const result /*: LocalChange[] */ = analysis(events, {
            pendingChanges,
            initialScanParams: { done: true }
          })
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

          const changes = analysis(events, {
            pendingChanges,
            initialScanParams: { done: true }
          })
          should({ changes, pendingChanges }).deepEqual({
            changes: [
              {
                sideName,
                type: 'Ignored',
                path
              }
            ],
            pendingChanges: []
          })
        })
      })

      describe('add(a, ino) + add(A, ino) + unlink(A, ino)', () => {
        it('ignores the unmerged temporary file whose case was changed', () => {
          const stats = { ino: 1 }
          const md5sum = 'xxx'
          const events /*: LocalEvent[] */ = [
            { type: 'add', path: 'foo', stats, md5sum },
            { type: 'add', path: 'FOO', stats, md5sum },
            { type: 'unlink', path: 'FOO' }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          const changes = analysis(events, {
            pendingChanges,
            initialScanParams: { done: true }
          })
          should({ changes, pendingChanges }).deepEqual({
            changes: [
              {
                sideName,
                type: 'Ignored',
                path: 'FOO'
              }
            ],
            pendingChanges: []
          })
        })
      })

      describe('add(a, ino) + add(A, ino, wip) + unlink(A, ino)', () => {
        it('ignores the unmerged temporary file whose case was changed', () => {
          const stats = { ino: 1 }
          const md5sum = 'xxx'
          const events /*: LocalEvent[] */ = [
            { type: 'add', path: 'foo', stats, md5sum },
            { type: 'add', path: 'FOO', stats, wip: true },
            { type: 'unlink', path: 'FOO' }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          const changes = analysis(events, {
            pendingChanges,
            initialScanParams: { done: true }
          })
          should({ changes, pendingChanges }).deepEqual({
            changes: [
              {
                sideName,
                type: 'Ignored',
                path: 'FOO'
              }
            ],
            pendingChanges: []
          })
        })
      })

      describe('addDir(a, ino) + addDir(A, ino) + unlinkDir(A, ino)', () => {
        it('ignores the unmerged temporary dir whose case was changed', () => {
          const stats = { ino: 1 }
          const events /*: LocalEvent[] */ = [
            { type: 'addDir', path: 'foo', stats },
            { type: 'addDir', path: 'FOO', stats },
            { type: 'unlinkDir', path: 'FOO' }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          const changes = analysis(events, {
            pendingChanges,
            initialScanParams: { done: true }
          })
          should({ changes, pendingChanges }).deepEqual({
            changes: [
              {
                sideName,
                type: 'Ignored',
                path: 'FOO'
              }
            ],
            pendingChanges: []
          })
        })
      })

      describe('addDir(a, ino) + addDir(A, ino, wip) + unlinkDir(A, ino)', () => {
        it('ignores the unmerged temporary dir whose case was changed', () => {
          const stats = { ino: 1 }
          const events /*: LocalEvent[] */ = [
            { type: 'addDir', path: 'foo', stats },
            { type: 'addDir', path: 'FOO', stats, wip: true },
            { type: 'unlinkDir', path: 'FOO' }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          const changes = analysis(events, {
            pendingChanges,
            initialScanParams: { done: true }
          })
          should({ changes, pendingChanges }).deepEqual({
            changes: [
              {
                sideName,
                type: 'Ignored',
                path: 'FOO'
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

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
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

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
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

          const changes = analysis(events, {
            pendingChanges,
            initialScanParams: { done: true }
          })

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

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([])
          should(pendingChanges).deepEqual([
            {
              sideName,
              type: 'FileMove',
              path: 'dst1',
              ino: 1,
              stats,
              old,
              md5sum: old.md5sum,
              wip: true
            }
          ])

          const nextEvents /*: LocalEvent[] */ = [
            { type: 'unlink', path: 'dst1' }
          ]
          should(
            analysis(nextEvents, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
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
          const old /*: Metadata */ = builders.metafile().ino(1).build()
          const stats = { ino: 1 }
          const { md5sum } = old
          const events /*: LocalEvent[] */ = [
            { type: 'unlink', path: 'src', old },
            { type: 'add', path: 'dst', stats, md5sum }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
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
          const old /*: Metadata */ = builders.metafile().ino(1).build()
          const stats = { ino: 1 }
          const { md5sum } = old
          const events /*: LocalEvent[] */ = [
            { type: 'unlinkDir', path: 'src', old },
            { type: 'add', path: 'dst', stats, md5sum }
          ]
          const pendingChanges /*: LocalChange[] */ = []
          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
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
          const old /*: Metadata */ = builders.metafile().ino(1).build()
          const stats = { ino: 1 }
          const { md5sum } = old
          const events /*: LocalEvent[] */ = [
            { type: 'add', path: 'dst1', stats, wip: true },
            { type: 'unlink', path: 'src', old },
            { type: 'add', path: 'dst2', stats, md5sum }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
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
          should(
            analysis(nextEvents, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([])
          should(pendingChanges).deepEqual([])
        })
      })

      describe('unlink(src) + add(tmp) + dropped unlink(tmp) + wip add(dst)', () => {
        it('is incomplete', () => {
          const old /*: Metadata */ = builders.metafile().ino(1).build()
          const stats = { ino: 1 }
          const events /*: LocalEvent[] */ = [
            { type: 'unlink', path: 'src', old },
            { type: 'add', path: 'dst1', stats, md5sum: old.md5sum },
            // dropped: {type: 'unlink', path: 'dst1', old},
            { type: 'add', path: 'dst2', stats, wip: true }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([])
          should(pendingChanges).deepEqual([
            {
              sideName,
              type: 'FileMove',
              path: 'dst2',
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
          const old /*: Metadata */ = builders.metafile().ino(1).build()
          const stats = { ino: 1 }
          const { md5sum } = old
          const events /*: LocalEvent[] */ = [
            { type: 'unlink', path: 'src', old },
            { type: 'add', path: 'dst1', stats, wip: true },
            // dropped: {type: 'unlink', path: 'dst1', old},
            { type: 'add', path: 'dst2', stats, md5sum }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
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

      describe('unlink(src) + wip add(tmp) + unlink(tmp) + add(dst)', () => {
        // This can happen when the user moves a file with an NFC encoded path
        // just downloaded from the remote Cozy on an HFS+ disk.
        it('is a complete FileMove', () => {
          const old /*: Metadata */ = builders
            .metafile()
            .path('src')
            .ino(1)
            .build()
          const stats = { ino: 1 }
          const { md5sum } = old
          const events /*: LocalEvent[] */ = [
            { type: 'unlink', path: 'src', old },
            { type: 'add', path: 'dst1', stats, wip: true },
            { type: 'unlink', path: 'dst1', old },
            { type: 'add', path: 'dst2', stats, md5sum }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
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

    describe('FileMove(replaced => first) + FileMove(second => replaced) + FileMove(replaced => dst)', () => {
      describe('unlink(replaced) + add(first) + unlink(second) + wip add(replaced) + unlink(replaced) + add(dst)', () => {
        it('follows the second move of second', () => {
          const first /*: Metadata */ = builders
            .metafile()
            .path('replaced')
            .ino(1)
            .build()
          const firstStats = { ino: 1 }
          const second /*: Metadata */ = builders
            .metafile()
            .path('second')
            .ino(2)
            .build()
          const secondStats = { ino: 2 }
          const events /*: LocalEvent[] */ = [
            { type: 'unlink', path: 'replaced', old: first },
            {
              type: 'add',
              path: 'first',
              stats: firstStats,
              md5sum: first.md5sum
            },
            { type: 'unlink', path: 'second', old: second },
            { type: 'add', path: 'replaced', stats: secondStats, wip: true },
            { type: 'unlink', path: 'replaced', old: first }, // XXX: old should be second but it's not been saved in pouch yet
            {
              type: 'add',
              path: 'dst',
              stats: secondStats,
              md5sum: second.md5sum
            }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
            {
              sideName,
              type: 'FileMove',
              path: 'dst',
              ino: 2,
              md5sum: second.md5sum,
              stats: secondStats,
              old: second
            },
            {
              sideName,
              type: 'FileMove',
              path: 'first',
              ino: 1,
              md5sum: first.md5sum,
              stats: firstStats,
              old: first
            }
          ])
          should(pendingChanges).deepEqual([])
        })
      })
    })

    describe('FileMove.update(src => dst)', () => {
      describe('unlink(src) + add(dst) + change(dst)', () => {
        it('happens when there is sufficient delay betwen move & change', () => {
          const old /*: Metadata */ = builders.metafile().ino(1).build()
          const addStats = {
            ino: old.ino,
            mtime: new Date(old.local.updated_at)
          }
          const changeStats = {
            ino: 1,
            mtime: new Date(addStats.mtime.getTime() + 1000)
          }
          const events /*: LocalEvent[] */ = [
            { type: 'unlink', path: 'src', old },
            { type: 'add', path: 'dst', stats: addStats, md5sum: old.md5sum },
            { type: 'change', path: 'dst', stats: changeStats, md5sum: 'yata' }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
            {
              sideName,
              type: 'FileMove',
              path: 'dst',
              md5sum: 'yata',
              ino: 1,
              stats: changeStats,
              old,
              update: {
                type: 'change',
                path: 'dst',
                stats: changeStats,
                md5sum: 'yata'
              }
            }
          ])
          should(pendingChanges).deepEqual([])
        })
      })

      describe('unlink(src, ino=1) + add(dst, ino=1) + change(dst, ino=2)', () => {
        it('does not include the change into the move', () => {
          const old /*: Metadata */ = builders.metafile().ino(1).build()
          const addStats = {
            ino: old.ino,
            mtime: new Date(old.local.updated_at)
          }
          const changeStats = {
            ino: 2,
            mtime: new Date(addStats.mtime.getTime() + 1000)
          }
          const events /*: LocalEvent[] */ = [
            { type: 'unlink', path: 'src', old },
            { type: 'add', path: 'dst', stats: addStats, md5sum: old.md5sum },
            { type: 'change', path: 'dst', stats: changeStats, md5sum: 'yata' }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
            {
              sideName,
              type: 'FileMove',
              path: 'dst',
              md5sum: old.md5sum,
              ino: old.ino,
              stats: addStats,
              old
            },
            {
              sideName,
              type: 'FileUpdate',
              path: 'dst',
              md5sum: 'yata',
              ino: changeStats.ino,
              stats: changeStats
            }
          ])
          should(pendingChanges).deepEqual([])
        })
      })

      describe('unlink(src) + add(dst) with different md5sum but same update date', () => {
        it('does not mark the move as an update', () => {
          const old /*: Metadata */ = builders.metafile().ino(1).build()
          const stats = { ino: old.ino, mtime: new Date(old.local.updated_at) }
          const events /*: LocalEvent[] */ = [
            { type: 'unlink', path: 'src', old },
            { type: 'add', path: 'dst', stats, md5sum: 'yata' }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
            {
              sideName,
              type: 'FileMove',
              path: 'dst',
              md5sum: old.md5sum,
              ino: old.ino,
              stats,
              old
            }
          ])
          should(pendingChanges).deepEqual([])
        })
      })

      describe('unlink(src) + add(dst) with different md5sum and update date', () => {
        it('marks the move as an update', () => {
          const old /*: Metadata */ = builders.metafile().ino(1).build()
          const stats = {
            ino: old.ino,
            mtime: new Date(new Date(old.local.updated_at).getTime() + 1000)
          }
          const events /*: LocalEvent[] */ = [
            { type: 'unlink', path: 'src', old },
            { type: 'add', path: 'dst', stats, md5sum: 'yata' }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
            {
              sideName,
              type: 'FileMove',
              path: 'dst',
              md5sum: 'yata',
              ino: old.ino,
              stats,
              old,
              update: {
                type: 'add',
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

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
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
          const old = builders.metafile().path(changedPath).ino(111).build()
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

          const changes = analysis(events, {
            pendingChanges,
            initialScanParams: { done: true }
          })

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

      describe('add(a, ino) + add(A, ino)', () => {
        it('is a case/normalization only change', () => {
          const old /*: Metadata */ = builders
            .metafile()
            .path('foo')
            .ino(1)
            .build()
          const stats = { ino: 1 }
          const events /*: LocalEvent[] */ = [
            { type: 'add', path: 'foo', stats, old },
            { type: 'add', path: 'FOO', stats, old }
          ]
          const pendingChanges = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
            {
              sideName,
              type: 'FileMove',
              path: 'FOO',
              ino: 1,
              stats,
              old
            }
          ])
        })
      })

      describe('add(A, ino, old={a, ino})', () => {
        it('is an unwatched case/normalization only change', () => {
          const ino = 123
          const stats = { ino }
          const md5sum = 'badbeef'
          const old = { path: 'foo', ino }
          const events /*: LocalEvent[] */ = [
            { type: 'add', path: 'FOO', md5sum, stats, old }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
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

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
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

      describe('add(a, ino) + add(A, ino)', () => {
        it('is not confused with a case/normalization change', () => {
          const stats = { ino: 1 }
          const md5sum = 'xxx'
          const events /*: LocalEvent[] */ = [
            { type: 'add', path: 'foo', stats, md5sum },
            { type: 'add', path: 'FOO', stats, md5sum }
          ]
          const pendingChanges = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
            {
              sideName,
              type: 'FileAddition',
              path: 'FOO',
              ino: 1,
              stats,
              md5sum
            }
          ])
        })
      })

      describe('add(a, ino) + add(A, ino) + change(a, ino)', () => {
        it('is not confused with a case/normalization change', () => {
          const stats = { ino: 1 }
          const md5sum = 'xxx'
          const events /*: LocalEvent[] */ = [
            { type: 'add', path: 'foo', stats, md5sum },
            { type: 'add', path: 'FOO', stats, md5sum },
            { type: 'change', path: 'foo', stats, md5sum }
          ]
          const pendingChanges = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
            {
              sideName,
              type: 'FileAddition',
              path: 'FOO',
              ino: 1,
              stats,
              md5sum
            }
          ])
        })
      })
    })

    describe('DirMove(src => dst)', () => {
      describe('unlinkDir(src) + addDir(dst)', () => {
        it('is the most common case', () => {
          const old /*: Metadata */ = builders.metadir().ino(1).build()
          const stats = { ino: 1 }
          const events /*: LocalEvent[] */ = [
            { type: 'unlinkDir', path: 'src', old },
            { type: 'addDir', path: 'dst', stats }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
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
          const old /*: Metadata */ = builders.metadir().ino(1).build()
          const stats = { ino: 1 }
          const events /*: LocalEvent[] */ = [
            { type: 'addDir', path: 'dst', stats },
            { type: 'unlinkDir', path: 'src', old }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
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
          const old /*: Metadata */ = builders.metadir().ino(1).build()
          const stats = { ino: 1 }
          const events /*: LocalEvent[] */ = [
            { type: 'unlinkDir', path: 'src', old },
            { type: 'addDir', path: 'dst1', stats, wip: true },
            // dropped: {type: 'unlinkDir', path: 'dst1', old},
            { type: 'addDir', path: 'dst2', stats }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
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
          const old /*: Metadata */ = builders.metadir().ino(1).build()
          const stats = { ino: 1 }
          const events /*: LocalEvent[] */ = [
            { type: 'unlinkDir', path: 'src', old },
            { type: 'addDir', path: 'dst1', stats },
            // dropped: {type: 'unlinkDir', path: 'dst1', old},
            { type: 'addDir', path: 'dst2', stats, wip: true }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([])
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

      describe('unlinkDir(src) + wip addDir(tmp) + unlinkDir(tmp) + addDir(dst)', () => {
        // This can happen when the user moves a directory with an NFC encoded
        // path just downloaded from the remote Cozy on an HFS+ disk.
        it('is a complete DirMove', () => {
          const old /*: Metadata */ = builders
            .metadir()
            .path('src')
            .ino(1)
            .build()
          const stats = { ino: 1 }
          const events /*: LocalEvent[] */ = [
            { type: 'unlinkDir', path: 'src', old },
            { type: 'addDir', path: 'dst1', stats, wip: true },
            { type: 'unlinkDir', path: 'dst1', old },
            { type: 'addDir', path: 'dst2', stats }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
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

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
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

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
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

    describe('DirMove(é => è) + FileMove(é/à => è/à)', () => {
      const dirStats = { ino: 765 }
      const fileStats = { ino: 766 }

      context('when é and à are encoded with NFC in PouchDB', () => {
        const oldDirPath = 'é'
        const newDirPath = 'è'
        const filename = 'à'

        it('is a DirMove to è encoded with NFD', () => {
          const oldDir = {
            path: oldDirPath.normalize('NFC'),
            ino: dirStats.ino
          }
          const oldFile = {
            path: path.join(oldDir.path, filename.normalize('NFC')),
            ino: fileStats.ino
          }

          const events /*: LocalEvent[] */ = [
            {
              type: 'unlinkDir',
              path: oldDir.path,
              old: oldDir
            },
            {
              type: 'addDir',
              path: newDirPath.normalize('NFD'),
              stats: dirStats
            },
            {
              type: 'unlink',
              path: oldFile.path,
              old: oldFile
            },
            {
              type: 'add',
              path: path.join(newDirPath, filename).normalize('NFD'),
              stats: fileStats
            }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
            {
              sideName,
              type: 'DirMove',
              path: newDirPath.normalize('NFD'),
              ino: dirStats.ino,
              stats: dirStats,
              old: oldDir
            }
          ])
          should(pendingChanges).deepEqual([])
        })
      })
    })

    describe('DirMove(replaced => first) + DirMove(second => replaced) + DirMove(replaced => dst)', () => {
      describe('unlinkDir(replaced) + addDir(first) + unlinkDir(second) + wip addDir(replaced) + unlinkDir(replaced) + addDir(dst)', () => {
        it('follows the second move of second', () => {
          const first /*: Metadata */ = builders
            .metadir()
            .path('replaced')
            .ino(1)
            .build()
          const firstStats = { ino: 1 }
          const second /*: Metadata */ = builders
            .metadir()
            .path('second')
            .ino(2)
            .build()
          const secondStats = { ino: 2 }
          const events /*: LocalEvent[] */ = [
            { type: 'unlinkDir', path: 'replaced', old: first },
            { type: 'addDir', path: 'first', stats: firstStats },
            { type: 'unlinkDir', path: 'second', old: second },
            { type: 'addDir', path: 'replaced', stats: secondStats, wip: true },
            { type: 'unlinkDir', path: 'replaced', old: first }, // XXX: old should be second but it's not been saved in pouch yet
            {
              type: 'addDir',
              path: 'dst',
              stats: secondStats
            }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
            {
              sideName,
              type: 'DirMove',
              path: 'dst',
              ino: 2,
              stats: secondStats,
              old: second
            },
            {
              sideName,
              type: 'DirMove',
              path: 'first',
              ino: 1,
              stats: firstStats,
              old: first
            }
          ])
          should(pendingChanges).deepEqual([])
        })
      })
    })

    describe('FileReplacement(x/x)', () => {
      describe('unlink(x) + add(x)', () => {
        it('is a deleted then added file', () => {
          const path = 'whatever'
          const old /*: Metadata */ = builders
            .metafile()
            .path(path)
            .ino(1)
            .build()
          const stats = { ino: 532806 }
          const events /*: LocalEvent[] */ = [
            { type: 'unlink', path, old },
            { type: 'add', path, stats, old: null }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          const changes = analysis(events, {
            pendingChanges,
            initialScanParams: { done: true }
          })
          should({ changes, pendingChanges }).deepEqual({
            changes: [
              {
                sideName,
                type: 'FileDeletion',
                ino: old.ino,
                path,
                old
              },
              {
                sideName,
                type: 'FileAddition',
                path,
                ino: stats.ino,
                stats,
                md5sum: undefined // XXX: We're just not computing it
              }
            ],
            pendingChanges: []
          })
        })
      })
    })

    describe('change(a) + change(a)', () => {
      it('is 2 FileUpdate in the right order', () => {
        const oldFile = {
          path: 'a',
          md5sum: '123',
          size: 1,
          ino: 1
        }

        const events /*: LocalEvent[] */ = [
          {
            type: 'change',
            path: oldFile.path,
            stats: { ino: 2, size: 2 },
            md5sum: '789',
            old: oldFile
          },
          {
            type: 'change',
            path: oldFile.path,
            stats: { ino: 3, size: 3 },
            md5sum: '789',
            old: oldFile
          }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        should(
          analysis(events, {
            pendingChanges,
            initialScanParams: { done: true }
          })
        ).deepEqual([
          {
            sideName,
            type: 'FileUpdate',
            path: oldFile.path,
            stats: { ino: 2, size: 2 },
            ino: 2,
            md5sum: '789',
            old: oldFile
          },
          {
            sideName,
            type: 'FileUpdate',
            path: oldFile.path.normalize('NFD'),
            stats: { ino: 3, size: 3 },
            ino: 3,
            md5sum: '789',
            old: oldFile
          }
        ])
        should(pendingChanges).deepEqual([])
      })
    })

    describe('FileUpdate(é/à)', () => {
      const dirStats = { ino: 765 }
      const fileStats = { ino: 766 }

      context('when é and à are encoded with NFC in PouchDB', () => {
        const dirPath = 'é'
        const filename = 'à'

        it('is a FileUpdate to è encoded with NFD', () => {
          const oldDir = { path: dirPath.normalize('NFC'), ino: dirStats.ino }
          const oldFile = {
            path: path.join(oldDir.path, filename.normalize('NFC')),
            ino: fileStats.ino
          }

          const events /*: LocalEvent[] */ = [
            {
              type: 'change',
              path: oldFile.path.normalize('NFD'),
              stats: fileStats,
              old: oldFile
            }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
            {
              sideName,
              type: 'FileUpdate',
              path: oldFile.path.normalize('NFD'),
              ino: fileStats.ino,
              stats: fileStats,
              old: oldFile,
              md5sum: undefined // XXX: We're just not computing it
            }
          ])
          should(pendingChanges).deepEqual([])
        })
      })
    })

    describe('move from inside move', () => {
      context('when parent path normalization differs in child path', () => {
        it('correctly replaces the parent path within the child move old path', () => {
          const parent /*: Metadata */ = builders
            .metadir()
            .path('énoncés'.normalize('NFD'))
            .ino(1)
            .build()
          const child /*: Metadata */ = builders
            .metadir()
            .path(path.join('énoncés'.normalize('NFC'), 'économie'))
            .ino(2)
            .build()
          const events /*: LocalEvent[] */ = [
            { type: 'addDir', path: 'corrigés', stats: { ino: parent.ino } },
            {
              type: 'addDir',
              path: 'corrigés/Économie',
              stats: { ino: child.ino }
            },
            // generated events
            { type: 'unlinkDir', path: parent.path, old: parent },
            { type: 'unlinkDir', path: child.path, old: child }
          ]
          const pendingChanges = []
          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { flushed: false }
            })
          ).deepEqual([
            {
              sideName,
              type: 'DirMove',
              path: 'corrigés',
              ino: parent.ino,
              stats: { ino: parent.ino },
              old: parent
            },
            {
              sideName,
              type: 'DirMove',
              path: 'corrigés/Économie',
              ino: child.ino,
              stats: { ino: child.ino },
              old: {
                ...child,
                path: 'corrigés/économie'
              },
              needRefetch: true
            }
          ])
        })
      })

      context(
        'happened when client was stopped (unlink* events are made up)',
        () => {
          it('is not detected as a child move', () => {
            const src /*: Metadata */ = builders
              .metadir()
              .path('src')
              .ino(1)
              .build()
            const dst /*: Metadata */ = builders
              .metadir()
              .path('dst')
              .ino(2)
              .build()
            const dst2 /*: Metadata */ = builders
              .metadir()
              .path('dst2')
              .ino(3)
              .build()
            const dir /*: Metadata */ = builders
              .metadir()
              .path('src/dir')
              .ino(4)
              .build()
            const emptySubdir /*: Metadata */ = builders
              .metadir()
              .path('src/dir/empty-subdir')
              .ino(5)
              .build()
            const subdir /*: Metadata */ = builders
              .metadir()
              .path('src/dir/subdir')
              .ino(6)
              .build()
            const file /*: Metadata */ = builders
              .metafile()
              .path('src/dir/subdir/file')
              .ino(7)
              .data('Initial content')
              .build()
            const events /*: LocalEvent[] */ = [
              { type: 'addDir', path: 'dst', stats: { ino: dst.ino } },
              { type: 'addDir', path: 'dst2', stats: { ino: dst2.ino } },
              { type: 'addDir', path: 'src', stats: { ino: src.ino } },
              {
                type: 'addDir',
                path: 'dst2/subdir',
                stats: { ino: subdir.ino }
              },
              { type: 'addDir', path: 'dst/dir', stats: { ino: dir.ino } },
              {
                type: 'add',
                path: 'dst2/subdir/file',
                stats: { ino: file.ino }
              },
              {
                type: 'addDir',
                path: 'dst/dir/empty-subdir',
                stats: { ino: emptySubdir.ino }
              },
              // generated events
              { type: 'unlinkDir', path: 'src/dir', old: dir },
              {
                type: 'unlinkDir',
                path: 'src/dir/empty-subdir',
                old: emptySubdir
              },
              { type: 'unlinkDir', path: 'src/dir/subdir', old: subdir },
              {
                type: 'unlink',
                path: path.normalize('src/dir/subdir/file'),
                old: file
              }
            ]
            const pendingChanges = []
            should(
              analysis(events, {
                pendingChanges,
                initialScanParams: { flushed: false }
              })
            ).deepEqual([
              {
                sideName,
                type: 'DirAddition',
                path: 'dst',
                ino: dst.ino,
                stats: { ino: dst.ino }
              },
              {
                sideName,
                type: 'DirMove',
                path: 'dst/dir',
                ino: dir.ino,
                stats: { ino: dir.ino },
                old: dir
              },
              {
                sideName,
                type: 'DirAddition',
                path: 'dst2',
                ino: dst2.ino,
                stats: { ino: dst2.ino }
              },
              {
                sideName,
                type: 'DirMove',
                path: 'dst2/subdir',
                ino: subdir.ino,
                stats: { ino: subdir.ino },
                old: subdir,
                needRefetch: true
              },
              {
                sideName,
                type: 'DirAddition',
                path: 'src',
                ino: src.ino,
                stats: { ino: src.ino }
              }
            ])
            should(pendingChanges).deepEqual([])
          })
        }
      )
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
          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
            {
              sideName,
              type: 'DirMove',
              path: 'dst',
              ino: dirIno,
              stats: { ino: dirIno },
              old: srcDir
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
          const srcDir /*: Metadata */ = builders
            .metadir()
            .path('src')
            .ino(1)
            .build()
          const srcFile /*: Metadata */ = builders
            .metafile()
            .path(path.normalize('src/file'))
            .ino(2)
            .data('Initial content')
            .build()
          const dirStats = { ino: 1, mtime: new Date(srcDir.local.updated_at) }
          const fileStats = {
            ino: 2,
            mtime: new Date(new Date(srcFile.local.updated_at).getTime() + 1000)
          }
          const newMd5sum = builders
            .metafile()
            .data('New content')
            .build().md5sum
          const events /*: LocalEvent[] */ = [
            { type: 'unlinkDir', path: 'src', old: srcDir },
            { type: 'addDir', path: 'dst', stats: dirStats },
            { type: 'unlink', path: path.normalize('src/file'), old: srcFile },
            {
              type: 'add',
              path: path.normalize('dst/file'),
              stats: fileStats,
              md5sum: newMd5sum
            }
          ]
          const pendingChanges = []
          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
            {
              sideName,
              type: 'DirMove',
              path: 'dst',
              ino: dirStats.ino,
              stats: dirStats,
              old: srcDir
            },
            {
              sideName,
              type: 'FileUpdate',
              path: path.normalize('dst/file'),
              ino: fileStats.ino,
              stats: fileStats,
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

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
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

      describe('addDir(a, ino) + addDir(A, ino)', () => {
        it('is not confused with a case/normalization change', () => {
          const stats = { ino: 1 }
          const events /*: LocalEvent[] */ = [
            { type: 'addDir', path: 'foo', stats },
            { type: 'addDir', path: 'FOO', stats }
          ]
          const pendingChanges = []

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: true }
            })
          ).deepEqual([
            {
              sideName,
              type: 'DirAddition',
              path: 'FOO',
              ino: 1,
              stats
            }
          ])
        })
      })
    })

    describe('Move squashing', () => {
      it('move into moved folder', () => {
        const dirStats = { ino: 1 }
        const dir = builders.metadir().path('src/dir').ino(dirStats.ino).build()
        const fileStats = { ino: 2 }
        const file = builders.metafile().path('file').ino(fileStats.ino).build()

        const events /*: LocalEvent[] */ = [
          { type: 'unlinkDir', path: dir.path, old: dir },
          { type: 'addDir', path: 'dst/dir', stats: dirStats },
          { type: 'unlink', path: file.path, old: file },
          { type: 'add', path: 'dst/dir/file', stats: fileStats }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        const changes = analysis(events, {
          pendingChanges,
          initialScanParams: { done: true }
        })
        changes
          .map(change => [
            change.type,
            change.old.path,
            change.path,
            change.needRefetch
          ])
          .should.deepEqual([
            ['DirMove', 'src/dir', 'dst/dir', undefined],
            ['FileMove', 'file', 'dst/dir/file', undefined]
          ])
      })

      it('child move', () => {
        const dirStats = { ino: 1 }
        const dir = builders.metadir().path('src/dir').ino(dirStats.ino).build()
        const fileStats = { ino: 2 }
        const file = builders
          .metafile()
          .path('src/dir/file')
          .ino(fileStats.ino)
          .build()

        const events /*: LocalEvent[] */ = [
          { type: 'unlinkDir', path: dir.path, old: dir },
          { type: 'addDir', path: 'dst/dir', stats: dirStats },
          { type: 'unlink', path: file.path, old: file },
          { type: 'add', path: 'dst/dir/file', stats: fileStats }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        const changes = analysis(events, {
          pendingChanges,
          initialScanParams: { done: true }
        })
        changes
          .map(change => [
            change.type,
            change.old.path,
            change.path,
            change.needRefetch
          ])
          .should.deepEqual([['DirMove', 'src/dir', 'dst/dir', undefined]])
      })

      it('child moved out of moved folder', () => {
        const dirStats = { ino: 1 }
        const dir = builders.metadir().path('src/dir').ino(dirStats.ino).build()
        const fileStats = { ino: 2 }
        const file = builders
          .metafile()
          .path('src/dir/file')
          .ino(fileStats.ino)
          .build()

        const events /*: LocalEvent[] */ = [
          { type: 'unlinkDir', path: dir.path, old: dir },
          { type: 'addDir', path: 'dst/dir', stats: dirStats },
          { type: 'unlink', path: file.path, old: file },
          { type: 'add', path: 'file', stats: fileStats }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        const changes = analysis(events, {
          pendingChanges,
          initialScanParams: { done: true }
        })
        changes
          .map(change => [
            change.type,
            change.old.path,
            change.path,
            change.needRefetch
          ])
          .should.deepEqual([
            ['DirMove', 'src/dir', 'dst/dir', undefined],
            ['FileMove', 'dst/dir/file', 'file', true]
          ])
      })

      it('child moved within moved dir', () => {
        const dirStats = { ino: 1 }
        const dir = builders.metadir().path('src/dir').ino(dirStats.ino).build()
        const fileStats = { ino: 2 }
        const file = builders
          .metafile()
          .path('src/dir/file')
          .ino(fileStats.ino)
          .build()

        const events /*: LocalEvent[] */ = [
          { type: 'unlinkDir', path: dir.path, old: dir },
          { type: 'addDir', path: 'dst/dir', stats: dirStats },
          { type: 'unlink', path: file.path, old: file },
          { type: 'add', path: 'dst/file', stats: fileStats }
        ]
        const pendingChanges /*: LocalChange[] */ = []

        const changes = analysis(events, {
          pendingChanges,
          initialScanParams: { done: true }
        })
        changes
          .map(change => [
            change.type,
            change.old.path,
            change.path,
            change.needRefetch
          ])
          .should.deepEqual([
            ['DirMove', 'src/dir', 'dst/dir', undefined],
            ['FileMove', 'dst/dir/file', 'dst/file', true]
          ])
      })
    })

    describe('Sorting', () => {
      describe('using the initial scan sorter', () => {
        it('sorts move(a to b) before add(b/child)', () => {
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

          const changes = analysis(events, {
            pendingChanges,
            initialScanParams: { flushed: false }
          })
          changes
            .map(change => [change.type, change.path])
            .should.deepEqual([
              ['DirAddition', 'dst'],
              ['DirMove', 'dst/dir'],
              ['DirAddition', 'dst/dir/childDir'],
              ['DirAddition', 'src']
            ])
        })

        it('sorts move(a to b) after delete(a/child)', () => {
          const dirStats = { ino: 3 }
          const dir = builders
            .metadir()
            .path('src/dir')
            .ino(dirStats.ino)
            .build()
          const childDirStats = { ino: 4 }
          const childDir = builders
            .metadir()
            .path('src/dir/childDir')
            .ino(childDirStats.ino)
            .build()
          const childFileStats = { ino: 5 }
          const childFile = builders
            .metafile()
            .path('src/dir/childFile')
            .ino(childFileStats.ino)
            .build()

          const events /*: LocalEvent[] */ = [
            { type: 'unlinkDir', path: childDir.path, old: childDir },
            { type: 'unlink', path: childFile.path, old: childFile },
            { type: 'unlinkDir', path: dir.path, old: dir },
            { type: 'addDir', path: 'dst', stats: { ino: 1 } },
            { type: 'addDir', path: 'src', stats: { ino: 2 } },
            { type: 'addDir', path: 'dst/dir', stats: dirStats }
          ]
          const pendingChanges /*: LocalChange[] */ = []

          const changes = analysis(events, {
            pendingChanges,
            initialScanParams: { flushed: false }
          })
          changes
            .map(change => [change.type, change.path])
            .should.deepEqual([
              ['DirAddition', 'dst'],
              ['DirAddition', 'src'],
              ['FileDeletion', 'src/dir/childFile'],
              ['DirDeletion', 'src/dir/childDir'],
              ['DirMove', 'dst/dir']
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

          const changes = analysis(events, {
            pendingChanges,
            initialScanParams: { done: false }
          })
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
            builders.metadir().path('src').ino(dirStats.ino).build()
          )
          const subdirMetadata /*: Metadata */ = normalizer(
            builders.metadir().path('src/subdir').ino(subdirStats.ino).build()
          )
          const fileMetadata /*: Metadata */ = normalizer(
            builders.metafile().path('src/file').ino(fileStats.ino).build()
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

          should(
            analysis(events, {
              pendingChanges,
              initialScanParams: { done: false }
            })
          ).deepEqual([
            {
              sideName,
              type: 'DirMove',
              path: 'dst',
              stats: dirStats,
              ino: dirStats.ino,
              old: dirMetadata
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
})

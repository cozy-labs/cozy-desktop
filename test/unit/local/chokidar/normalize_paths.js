/* eslint-env mocha */

const should = require('should')
const path = require('path')

const normalizePaths = require('../../../../core/local/chokidar/normalize_paths')

const Builders = require('../../../support/builders')
const configHelpers = require('../../../support/helpers/config')
const pouchHelpers = require('../../../support/helpers/pouch')
const { onPlatform } = require('../../../support/helpers/platform')

const stepOptions = self => ({
  pouch: self.pouch
})

onPlatform('darwin', () => {
  describe('core/local/chokidar_steps/normalize_paths', () => {
    let builders

    before('instanciate config', configHelpers.createConfig)
    beforeEach('instanciate pouch', pouchHelpers.createDatabase)

    beforeEach('set up builders', function() {
      builders = new Builders({ pouch: this.pouch })
    })

    afterEach('clean pouch', pouchHelpers.cleanDatabase)
    after('clean config directory', configHelpers.cleanConfig)

    describe('added file in dir on filesystem normalizing with NFD', () => {
      const dirPath = 'corrigés'.normalize('NFD')
      const filename = 'Réussite'.normalize('NFD')

      context('when parent is saved with NFC encoded path in Pouch', () => {
        let dir
        beforeEach(async function() {
          dir = await builders
            .metadir()
            .path(dirPath.normalize('NFC'))
            .upToDate()
            .create()
        })

        it('reuses the existing parent path', async function() {
          const changes = [
            {
              type: 'FileAddition',
              path: path.join(dirPath, filename),
              stats: { ino: 1 }
            }
          ]
          const [change] = await normalizePaths.step(changes, stepOptions(this))
          should(change).have.properties({
            path: path.join(dir.path, filename)
          })
        })
      })

      context('when parent is saved with NFD encoded path in Pouch', () => {
        beforeEach(async function() {
          await builders
            .metadir()
            .path(dirPath.normalize('NFD'))
            .upToDate()
            .create()
        })

        it('does not normalize the new path', async function() {
          const changes = [
            {
              type: 'FileAddition',
              path: path.join(dirPath, filename),
              stats: { ino: 1 }
            }
          ]
          const [change] = await normalizePaths.step(changes, stepOptions(this))
          should(change).have.properties({
            path: path.join(dirPath, filename)
          })
        })
      })

      context(
        'when parent is saved with neither NFD nor NFC encoded path in Pouch',
        () => {
          const dirFirst = 'Énoncés'
          const dirSecond = 'et corrigés'
          const dirPath = (dirFirst + dirSecond).normalize('NFD')

          let dir
          beforeEach(async function() {
            dir = await builders
              .metadir()
              .path(dirFirst.normalize('NFD') + dirSecond.normalize('NFC'))
              .upToDate()
              .create()
          })

          it('reuses the existing parent path', async function() {
            const changes = [
              {
                type: 'FileAddition',
                path: path.join(dirPath, filename),
                stats: { ino: 1 }
              }
            ]
            const [change] = await normalizePaths.step(
              changes,
              stepOptions(this)
            )
            should(change).have.properties({
              path: path.join(dir.path, filename)
            })
          })
        }
      )
    })

    describe('changed file in dir on filesystem normalizing with NFD', () => {
      const dirPath = 'corrigés'.normalize('NFD')
      const filename = 'Réussite'.normalize('NFD')

      context('when parent is saved with NFC encoded path in Pouch', () => {
        let dir
        beforeEach(async function() {
          dir = await builders
            .metadir()
            .path(dirPath.normalize('NFC'))
            .upToDate()
            .create()
        })

        context('when file is saved with NFC encoded name in Pouch', () => {
          let file
          beforeEach(async function() {
            file = await builders
              .metafile()
              .path(path.join(dir.path, filename.normalize('NFC')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('reuses the existing file path', async function() {
            const changes = [
              {
                type: 'FileUpdate',
                path: path.join(dirPath, filename),
                stats: { ino: 1 },
                old: { path: file.path }
              },
              {
                type: 'FileDeletion',
                path: path.join(dirPath, filename),
                old: { path: file.path }
              }
            ]
            const resultByChangeType = {}
            for (const change of changes) {
              const [{ path }] = await normalizePaths.step(
                [change],
                stepOptions(this)
              )
              resultByChangeType[change.type] = { path }
            }
            should(resultByChangeType).deepEqual({
              FileUpdate: {
                path: file.path
              },
              FileDeletion: {
                path: file.path
              }
            })
          })
        })

        context('when file is saved with NFD encoded name in Pouch', () => {
          let file
          beforeEach(async function() {
            file = await builders
              .metafile()
              .path(path.join(dir.path, filename.normalize('NFD')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('reuses the existing file path', async function() {
            const changes = [
              {
                type: 'FileUpdate',
                path: path.join(dirPath, filename),
                stats: { ino: 1 },
                old: { path: file.path }
              },
              {
                type: 'FileDeletion',
                path: path.join(dirPath, filename),
                old: { path: file.path }
              }
            ]
            const resultByChangeType = {}
            for (const change of changes) {
              const [{ path }] = await normalizePaths.step(
                [change],
                stepOptions(this)
              )
              resultByChangeType[change.type] = { path }
            }
            should(resultByChangeType).deepEqual({
              FileUpdate: {
                path: file.path
              },
              FileDeletion: {
                path: file.path
              }
            })
          })
        })
      })

      context('when parent is saved with NFD encoded path in Pouch', () => {
        let dir
        beforeEach(async function() {
          dir = await builders
            .metadir()
            .path(dirPath.normalize('NFD'))
            .upToDate()
            .create()
        })

        context('when file is saved with NFC encoded name in Pouch', () => {
          let file
          beforeEach(async function() {
            file = await builders
              .metafile()
              .path(path.join(dir.path, filename.normalize('NFC')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('reuses the existing file path', async function() {
            const changes = [
              {
                type: 'FileUpdate',
                path: path.join(dirPath, filename),
                stats: { ino: 1 },
                old: { path: file.path }
              },
              {
                type: 'FileDeletion',
                path: path.join(dirPath, filename),
                old: { path: file.path }
              }
            ]
            const resultByChangeType = {}
            for (const change of changes) {
              const [{ path }] = await normalizePaths.step(
                [change],
                stepOptions(this)
              )
              resultByChangeType[change.type] = { path }
            }
            should(resultByChangeType).deepEqual({
              FileUpdate: {
                path: file.path
              },
              FileDeletion: {
                path: file.path
              }
            })
          })
        })

        context('when file is saved with NFD encoded name in Pouch', () => {
          let file
          beforeEach(async function() {
            file = await builders
              .metafile()
              .path(path.join(dir.path, filename.normalize('NFD')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('reuses the existing file path', async function() {
            const changes = [
              {
                type: 'FileUpdate',
                path: path.join(dirPath, filename),
                stats: { ino: 1 },
                old: { path: file.path }
              },
              {
                type: 'FileDeletion',
                path: path.join(dirPath, filename),
                old: { path: file.path }
              }
            ]
            const resultByChangeType = {}
            for (const change of changes) {
              const [{ path }] = await normalizePaths.step(
                [change],
                stepOptions(this)
              )
              resultByChangeType[change.type] = { path }
            }
            should(resultByChangeType).deepEqual({
              FileUpdate: {
                path: file.path
              },
              FileDeletion: {
                path: file.path
              }
            })
          })
        })
      })

      context(
        'when parent is saved with neither NFD nor NFC encoded path in Pouch',
        () => {
          const dirFirst = 'Énoncés'
          const dirSecond = 'et corrigés'
          const dirPath = (dirFirst + dirSecond).normalize('NFD')

          let dir
          beforeEach(async function() {
            dir = await builders
              .metadir()
              .path(dirFirst.normalize('NFD') + dirSecond.normalize('NFC'))
              .upToDate()
              .create()
          })

          context('when file is saved with NFC encoded name in Pouch', () => {
            let file
            beforeEach(async function() {
              file = await builders
                .metafile()
                .path(path.join(dir.path, filename.normalize('NFC')))
                .data('initial content')
                .upToDate()
                .create()
            })

            it('reuses the existing file path', async function() {
              const changes = [
                {
                  type: 'FileUpdate',
                  path: path.join(dirPath, filename),
                  stats: { ino: 1 },
                  old: { path: file.path }
                },
                {
                  type: 'FileDeletion',
                  path: path.join(dirPath, filename),
                  old: { path: file.path }
                }
              ]
              const resultByChangeType = {}
              for (const change of changes) {
                const [{ path }] = await normalizePaths.step(
                  [change],
                  stepOptions(this)
                )
                resultByChangeType[change.type] = { path }
              }
              should(resultByChangeType).deepEqual({
                FileUpdate: {
                  path: file.path
                },
                FileDeletion: {
                  path: file.path
                }
              })
            })
          })

          context('when file is saved with NFD encoded name in Pouch', () => {
            let file
            beforeEach(async function() {
              file = await builders
                .metafile()
                .path(path.join(dir.path, filename.normalize('NFD')))
                .data('initial content')
                .upToDate()
                .create()
            })

            it('reuses the existing file path', async function() {
              const changes = [
                {
                  type: 'FileUpdate',
                  path: path.join(dirPath, filename),
                  stats: { ino: 1 },
                  old: { path: file.path }
                },
                {
                  type: 'FileDeletion',
                  path: path.join(dirPath, filename),
                  old: { path: file.path }
                }
              ]
              const resultByChangeType = {}
              for (const change of changes) {
                const [{ path }] = await normalizePaths.step(
                  [change],
                  stepOptions(this)
                )
                resultByChangeType[change.type] = { path }
              }
              should(resultByChangeType).deepEqual({
                FileUpdate: {
                  path: file.path
                },
                FileDeletion: {
                  path: file.path
                }
              })
            })
          })
        }
      )
    })

    describe('renamed dir with child on filesystem normalizing with NFD', () => {
      const srcDirPath = 'énoncés'.normalize('NFD')
      const dstDirPath = 'corrigés'.normalize('NFD')
      const filename = 'Réussite'.normalize('NFD')

      context('when parent is saved with NFC encoded path in Pouch', () => {
        let dir
        beforeEach(async function() {
          dir = await builders
            .metadir()
            .path(srcDirPath.normalize('NFC'))
            .upToDate()
            .create()
        })

        context('when file is saved with NFC encoded name in Pouch', () => {
          let file
          beforeEach(async function() {
            file = await builders
              .metafile()
              .path(path.join(dir.path, filename.normalize('NFC')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('reuses the existing file name', async function() {
            const changes = [
              {
                type: 'DirMove',
                path: dstDirPath,
                stats: { ino: 1 },
                old: {
                  path: dir.path
                }
              },
              {
                type: 'FileMove',
                path: path.join(dstDirPath, filename),
                stats: { ino: 2 },
                old: {
                  path: file.path
                }
              }
            ]
            const [dirMove, fileMove] = await normalizePaths.step(
              changes,
              stepOptions(this)
            )
            should(dirMove).have.properties({
              path: dstDirPath
            })
            should(fileMove).have.properties({
              path: path.join(dstDirPath, path.basename(file.path))
            })
          })
        })

        context('when file is saved with NFD encoded name in Pouch', () => {
          let file
          beforeEach(async function() {
            file = await builders
              .metafile()
              .path(path.join(dir.path, filename.normalize('NFD')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('reuses the existing file name', async function() {
            const changes = [
              {
                type: 'DirMove',
                path: dstDirPath,
                stats: { ino: 1 },
                old: {
                  path: dir.path
                }
              },
              {
                type: 'FileMove',
                path: path.join(dstDirPath, filename),
                stats: { ino: 2 },
                old: {
                  path: file.path
                }
              }
            ]
            const [dirMove, fileMove] = await normalizePaths.step(
              changes,
              stepOptions(this)
            )
            should(dirMove).have.properties({
              path: dstDirPath
            })
            should(fileMove).have.properties({
              path: path.join(dstDirPath, path.basename(file.path))
            })
          })
        })
      })

      context('when parent is saved with NFD encoded path in Pouch', () => {
        let dir
        beforeEach(async function() {
          dir = await builders
            .metadir()
            .path(srcDirPath.normalize('NFD'))
            .upToDate()
            .create()
        })

        context('when file is saved with NFC encoded name in Pouch', () => {
          let file
          beforeEach(async function() {
            file = await builders
              .metafile()
              .path(path.join(dir.path, filename.normalize('NFC')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('reuses the existing file name', async function() {
            const changes = [
              {
                type: 'DirMove',
                path: dstDirPath,
                stats: { ino: 1 },
                old: {
                  path: dir.path
                }
              },
              {
                type: 'FileMove',
                path: path.join(dstDirPath, filename),
                stats: { ino: 2 },
                old: {
                  path: file.path
                }
              }
            ]
            const [dirMove, fileMove] = await normalizePaths.step(
              changes,
              stepOptions(this)
            )
            should(dirMove).have.properties({
              path: dstDirPath
            })
            should(fileMove).have.properties({
              path: path.join(dstDirPath, path.basename(file.path))
            })
          })
        })

        context('when file is saved with NFD encoded name in Pouch', () => {
          let file
          beforeEach(async function() {
            file = await builders
              .metafile()
              .path(path.join(dir.path, filename.normalize('NFD')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('reuses the existing file name', async function() {
            const changes = [
              {
                type: 'DirMove',
                path: dstDirPath,
                stats: { ino: 1 },
                old: {
                  path: dir.path
                }
              },
              {
                type: 'FileMove',
                path: path.join(dstDirPath, filename),
                stats: { ino: 2 },
                old: {
                  path: file.path
                }
              }
            ]
            const [dirMove, fileMove] = await normalizePaths.step(
              changes,
              stepOptions(this)
            )
            should(dirMove).have.properties({
              path: dstDirPath
            })
            should(fileMove).have.properties({
              path: path.join(dstDirPath, path.basename(file.path))
            })
          })
        })
      })

      context(
        'when parent is saved with neither NFD nor NFC encoded path in Pouch',
        () => {
          const dirPath =
            'Énoncés'.normalize('NFD') + 'et corrigés'.normalize('NFC')
          const dstDirPath = 'Énoncés / corrigés'.normalize('NFD')

          let dir
          beforeEach(async function() {
            dir = await builders
              .metadir()
              .path(dirPath)
              .upToDate()
              .create()
          })

          context('when file is saved with NFC encoded name in Pouch', () => {
            let file
            beforeEach(async function() {
              file = await builders
                .metafile()
                .path(path.join(dir.path, filename.normalize('NFC')))
                .data('initial content')
                .upToDate()
                .create()
            })

            it('reuses the existing file name', async function() {
              const changes = [
                {
                  type: 'DirMove',
                  path: dstDirPath,
                  stats: { ino: 1 },
                  old: {
                    path: dir.path
                  }
                },
                {
                  type: 'FileMove',
                  path: path.join(dstDirPath, filename),
                  stats: { ino: 2 },
                  old: {
                    path: file.path
                  }
                }
              ]
              const [dirMove, fileMove] = await normalizePaths.step(
                changes,
                stepOptions(this)
              )
              should(dirMove).have.properties({
                path: dstDirPath
              })
              should(fileMove).have.properties({
                path: path.join(dstDirPath, path.basename(file.path))
              })
            })
          })

          context('when file is saved with NFD encoded name in Pouch', () => {
            let file
            beforeEach(async function() {
              file = await builders
                .metafile()
                .path(path.join(dir.path, filename.normalize('NFD')))
                .data('initial content')
                .upToDate()
                .create()
            })

            it('reuses the existing file name', async function() {
              const changes = [
                {
                  type: 'DirMove',
                  path: dstDirPath,
                  stats: { ino: 1 },
                  old: {
                    path: dir.path
                  }
                },
                {
                  type: 'FileMove',
                  path: path.join(dstDirPath, filename),
                  stats: { ino: 2 },
                  old: {
                    path: file.path
                  }
                }
              ]
              const [dirMove, fileMove] = await normalizePaths.step(
                changes,
                stepOptions(this)
              )
              should(dirMove).have.properties({
                path: dstDirPath
              })
              should(fileMove).have.properties({
                path: path.join(dstDirPath, path.basename(file.path))
              })
            })
          })
        }
      )
    })

    describe('renamed file in dir on filesystem normalizing with NFD', () => {
      const dirPath = 'corrigés'.normalize('NFD')
      const srcFilename = 'Réussite'.normalize('NFD')
      const dstFilename = 'Échec'.normalize('NFD')

      context('when parent is saved with NFC encoded path in Pouch', () => {
        let dir
        beforeEach(async function() {
          dir = await builders
            .metadir()
            .path(dirPath.normalize('NFC'))
            .upToDate()
            .create()
        })

        context('when file is saved with NFC encoded name in Pouch', () => {
          let file
          beforeEach(async function() {
            file = await builders
              .metafile()
              .path(path.join(dir.path, srcFilename.normalize('NFC')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('reuses the existing parent path', async function() {
            const changes = [
              {
                type: 'FileMove',
                path: path.join(dirPath, dstFilename),
                stats: { ino: 2 },
                old: {
                  path: file.path
                }
              }
            ]
            const [fileMove] = await normalizePaths.step(
              changes,
              stepOptions(this)
            )
            should(fileMove).have.properties({
              path: path.join(dir.path, dstFilename)
            })
          })
        })

        context('when file is saved with NFD encoded name in Pouch', () => {
          let file
          beforeEach(async function() {
            file = await builders
              .metafile()
              .path(path.join(dir.path, srcFilename.normalize('NFD')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('reuses the existing parent path', async function() {
            const changes = [
              {
                type: 'FileMove',
                path: path.join(dirPath, dstFilename),
                stats: { ino: 2 },
                old: {
                  path: file.path
                }
              }
            ]
            const [fileMove] = await normalizePaths.step(
              changes,
              stepOptions(this)
            )
            should(fileMove).have.properties({
              path: path.join(dir.path, dstFilename.normalize('NFD'))
            })
          })
        })
      })

      context('when parent is saved with NFD encoded path in Pouch', () => {
        let dir
        beforeEach(async function() {
          dir = await builders
            .metadir()
            .path(dirPath.normalize('NFD'))
            .upToDate()
            .create()
        })

        context('when file is saved with NFC encoded name in Pouch', () => {
          let file
          beforeEach(async function() {
            file = await builders
              .metafile()
              .path(path.join(dir.path, srcFilename.normalize('NFC')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('reuses the existing parent path', async function() {
            const changes = [
              {
                type: 'FileMove',
                path: path.join(dirPath, dstFilename),
                stats: { ino: 2 },
                old: {
                  path: file.path
                }
              }
            ]
            const [fileMove] = await normalizePaths.step(
              changes,
              stepOptions(this)
            )
            should(fileMove).have.properties({
              path: path.join(dir.path, dstFilename)
            })
          })
        })

        context('when file is saved with NFD encoded name in Pouch', () => {
          let file
          beforeEach(async function() {
            file = await builders
              .metafile()
              .path(path.join(dir.path, srcFilename.normalize('NFD')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('does not normalize the new paths', async function() {
            const changes = [
              {
                type: 'FileMove',
                path: path.join(dirPath, dstFilename),
                stats: { ino: 2 },
                old: {
                  path: file.path
                }
              }
            ]
            const [fileMove] = await normalizePaths.step(
              changes,
              stepOptions(this)
            )
            should(fileMove).have.properties({
              path: path.join(dirPath, dstFilename)
            })
          })
        })
      })

      context(
        'when parent is saved with neither NFD nor NFC encoded path in Pouch',
        () => {
          const dirFirst = 'Énoncés'
          const dirSecond = ' et corrigés'
          const dirPath = (dirFirst + dirSecond).normalize('NFD')

          let dir
          beforeEach(async function() {
            dir = await builders
              .metadir()
              .path(dirFirst.normalize('NFD') + dirSecond.normalize('NFC'))
              .upToDate()
              .create()
          })

          context('when file is saved with NFC encoded name in Pouch', () => {
            let file
            beforeEach(async function() {
              file = await builders
                .metafile()
                .path(path.join(dir.path, srcFilename.normalize('NFC')))
                .data('initial content')
                .upToDate()
                .create()
            })

            it('reuses the existing parent path', async function() {
              const changes = [
                {
                  type: 'FileMove',
                  path: path.join(dirPath, dstFilename),
                  stats: { ino: 2 },
                  old: {
                    path: file.path
                  }
                }
              ]
              const [fileMove] = await normalizePaths.step(
                changes,
                stepOptions(this)
              )
              should(fileMove).have.properties({
                path: path.join(dir.path, dstFilename)
              })
            })
          })

          context('when file is saved with NFD encoded name in Pouch', () => {
            let file
            beforeEach(async function() {
              file = await builders
                .metafile()
                .path(path.join(dir.path, srcFilename.normalize('NFD')))
                .data('initial content')
                .upToDate()
                .create()
            })

            it('reuses the existing parent path', async function() {
              const changes = [
                {
                  type: 'FileMove',
                  path: path.join(dirPath, dstFilename),
                  stats: { ino: 2 },
                  old: {
                    path: file.path
                  }
                }
              ]
              const [fileMove] = await normalizePaths.step(
                changes,
                stepOptions(this)
              )
              should(fileMove).have.properties({
                path: path.join(dir.path, dstFilename)
              })
            })
          })
        }
      )
    })

    describe('renamed file in renamed dir on filesystem normalizing with NFD', () => {
      const srcDirPath = 'énoncés'.normalize('NFD')
      const dstDirPath = 'corrigés'.normalize('NFD')
      const srcFilename = 'Réussite'.normalize('NFD')
      const dstFilename = 'Échec'.normalize('NFD')

      context('when parent is saved with NFC encoded path in Pouch', () => {
        let dir
        beforeEach(async function() {
          dir = await builders
            .metadir()
            .path(srcDirPath.normalize('NFC'))
            .upToDate()
            .create()
        })

        context('when file is saved with NFC encoded name in Pouch', () => {
          let file
          beforeEach(async function() {
            file = await builders
              .metafile()
              .path(path.join(dir.path, srcFilename.normalize('NFC')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('does not normalize the new paths', async function() {
            const changes = [
              {
                type: 'DirMove',
                path: dstDirPath,
                stats: { ino: 1 },
                old: {
                  path: dir.path
                }
              },
              {
                type: 'FileMove',
                path: path.join(dstDirPath, dstFilename),
                stats: { ino: 2 },
                old: {
                  path: file.path
                }
              }
            ]
            const [dirMove, fileMove] = await normalizePaths.step(
              changes,
              stepOptions(this)
            )
            should(dirMove).have.properties({
              path: dstDirPath
            })
            should(fileMove).have.properties({
              path: path.join(dstDirPath, dstFilename)
            })
          })
        })

        context('when file is saved with NFD encoded name in Pouch', () => {
          let file
          beforeEach(async function() {
            file = await builders
              .metafile()
              .path(path.join(dir.path, srcFilename.normalize('NFD')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('does not normalize the new paths', async function() {
            const changes = [
              {
                type: 'DirMove',
                path: dstDirPath,
                stats: { ino: 1 },
                old: {
                  path: dir.path
                }
              },
              {
                type: 'FileMove',
                path: path.join(dstDirPath, dstFilename),
                stats: { ino: 2 },
                old: {
                  path: file.path
                }
              }
            ]
            const [dirMove, fileMove] = await normalizePaths.step(
              changes,
              stepOptions(this)
            )
            should(dirMove).have.properties({
              path: dstDirPath
            })
            should(fileMove).have.properties({
              path: path.join(dstDirPath, dstFilename)
            })
          })
        })
      })

      context('when parent is saved with NFD encoded path in Pouch', () => {
        let dir
        beforeEach(async function() {
          dir = await builders
            .metadir()
            .path(srcDirPath.normalize('NFD'))
            .upToDate()
            .create()
        })

        context('when file is saved with NFC encoded name in Pouch', () => {
          let file
          beforeEach(async function() {
            file = await builders
              .metafile()
              .path(path.join(dir.path, srcFilename.normalize('NFC')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('does not normalize the new paths', async function() {
            const changes = [
              {
                type: 'DirMove',
                path: dstDirPath,
                stats: { ino: 1 },
                old: {
                  path: dir.path
                }
              },
              {
                type: 'FileMove',
                path: path.join(dstDirPath, dstFilename),
                stats: { ino: 2 },
                old: {
                  path: file.path
                }
              }
            ]
            const [dirMove, fileMove] = await normalizePaths.step(
              changes,
              stepOptions(this)
            )
            should(dirMove).have.properties({
              path: dstDirPath
            })
            should(fileMove).have.properties({
              path: path.join(dstDirPath, dstFilename)
            })
          })
        })

        context('when file is saved with NFD encoded name in Pouch', () => {
          let file
          beforeEach(async function() {
            file = await builders
              .metafile()
              .path(path.join(dir.path, srcFilename.normalize('NFD')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('does not normalize the new paths', async function() {
            const changes = [
              {
                type: 'DirMove',
                path: dstDirPath,
                stats: { ino: 1 },
                old: {
                  path: dir.path
                }
              },
              {
                type: 'FileMove',
                path: path.join(dstDirPath, dstFilename),
                stats: { ino: 2 },
                old: {
                  path: file.path
                }
              }
            ]
            const [dirMove, fileMove] = await normalizePaths.step(
              changes,
              stepOptions(this)
            )
            should(dirMove).have.properties({
              path: dstDirPath
            })
            should(fileMove).have.properties({
              path: path.join(dstDirPath, dstFilename)
            })
          })
        })
      })

      context(
        'when parent is saved with neither NFD nor NFC encoded path in Pouch',
        () => {
          const srcDirPath =
            'Énoncés'.normalize('NFD') + 'et corrigés'.normalize('NFC')
          const dstDirPath = 'Énoncés / corrigés'.normalize('NFD')

          let dir
          beforeEach(async function() {
            dir = await builders
              .metadir()
              .path(srcDirPath)
              .upToDate()
              .create()
          })

          context('when file is saved with NFC encoded name in Pouch', () => {
            let file
            beforeEach(async function() {
              file = await builders
                .metafile()
                .path(path.join(dir.path, srcFilename.normalize('NFC')))
                .data('initial content')
                .upToDate()
                .create()
            })

            it('does not normalize the new paths', async function() {
              const changes = [
                {
                  type: 'DirMove',
                  path: dstDirPath,
                  stats: { ino: 1 },
                  old: {
                    path: dir.path
                  }
                },
                {
                  type: 'FileMove',
                  path: path.join(dstDirPath, dstFilename),
                  stats: { ino: 2 },
                  old: {
                    path: file.path
                  }
                }
              ]
              const [dirMove, fileMove] = await normalizePaths.step(
                changes,
                stepOptions(this)
              )
              should(dirMove).have.properties({
                path: dstDirPath
              })
              should(fileMove).have.properties({
                path: path.join(dstDirPath, dstFilename)
              })
            })
          })

          context('when file is saved with NFD encoded name in Pouch', () => {
            let file
            beforeEach(async function() {
              file = await builders
                .metafile()
                .path(path.join(dir.path, srcFilename.normalize('NFD')))
                .data('initial content')
                .upToDate()
                .create()
            })

            it('does not normalize the new paths', async function() {
              const changes = [
                {
                  type: 'DirMove',
                  path: dstDirPath,
                  stats: { ino: 1 },
                  old: {
                    path: dir.path
                  }
                },
                {
                  type: 'FileMove',
                  path: path.join(dstDirPath, dstFilename),
                  stats: { ino: 2 },
                  old: {
                    path: file.path
                  }
                }
              ]
              const [dirMove, fileMove] = await normalizePaths.step(
                changes,
                stepOptions(this)
              )
              should(dirMove).have.properties({
                path: dstDirPath
              })
              should(fileMove).have.properties({
                path: path.join(dstDirPath, dstFilename)
              })
            })
          })

          context(
            'when file is saved with neither NFD nor NFC encoded name in Pouch',
            () => {
              const srcFilename =
                'Réussite'.normalize('NFD') + ' phénoménale'.normalize('NFC')
              const dstFilename = 'Échec inconséquent'.normalize('NFD')

              let file
              beforeEach(async function() {
                file = await builders
                  .metafile()
                  .path(srcFilename)
                  .data('initial content')
                  .upToDate()
                  .create()
              })

              it('does not normalize the new paths', async function() {
                const changes = [
                  {
                    type: 'DirMove',
                    path: dstDirPath,
                    stats: { ino: 1 },
                    old: {
                      path: dir.path
                    }
                  },
                  {
                    type: 'FileMove',
                    path: path.join(dstDirPath, dstFilename),
                    stats: { ino: 2 },
                    old: {
                      path: file.path
                    }
                  }
                ]
                const [dirMove, fileMove] = await normalizePaths.step(
                  changes,
                  stepOptions(this)
                )
                should(dirMove).have.properties({
                  path: dstDirPath
                })
                should(fileMove).have.properties({
                  path: path.join(dstDirPath, dstFilename)
                })
              })
            }
          )
        }
      )
    })

    describe('moved file to renamed dir on filesystem normalizing with NFD', () => {
      const srcDirPath = 'énoncés'.normalize('NFD')
      const dstDirPath = 'corrigés'.normalize('NFD')
      const filename = 'Réussite'.normalize('NFD')

      context('when parent is saved with NFC encoded path in Pouch', () => {
        let dir
        beforeEach(async function() {
          dir = await builders
            .metadir()
            .path(srcDirPath.normalize('NFC'))
            .upToDate()
            .create()
        })

        context('when file is saved with NFC encoded name in Pouch', () => {
          let file
          beforeEach(async function() {
            file = await builders
              .metafile()
              .path(filename.normalize('NFC'))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('reuses the existing file name', async function() {
            const changes = [
              {
                type: 'DirMove',
                path: dstDirPath,
                stats: { ino: 1 },
                old: {
                  path: dir.path
                }
              },
              {
                type: 'FileMove',
                path: path.join(dstDirPath, filename),
                stats: { ino: 2 },
                old: {
                  path: file.path
                }
              }
            ]
            const [dirMove, fileMove] = await normalizePaths.step(
              changes,
              stepOptions(this)
            )
            should(dirMove).have.properties({
              path: dstDirPath
            })
            should(fileMove).have.properties({
              path: path.join(dstDirPath, path.basename(file.path))
            })
          })
        })

        context('when file is saved with NFD encoded name in Pouch', () => {
          let file
          beforeEach(async function() {
            file = await builders
              .metafile()
              .path(filename.normalize('NFD'))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('reuses the existing file name', async function() {
            const changes = [
              {
                type: 'DirMove',
                path: dstDirPath,
                stats: { ino: 1 },
                old: {
                  path: dir.path
                }
              },
              {
                type: 'FileMove',
                path: path.join(dstDirPath, filename),
                stats: { ino: 2 },
                old: {
                  path: file.path
                }
              }
            ]
            const [dirMove, fileMove] = await normalizePaths.step(
              changes,
              stepOptions(this)
            )
            should(dirMove).have.properties({
              path: dstDirPath
            })
            should(fileMove).have.properties({
              path: path.join(dstDirPath, path.basename(file.path))
            })
          })
        })

        context(
          'when file is saved with neither NFD nor NFC encoded name in Pouch',
          () => {
            const filenameFirst = 'Réussite'
            const filenameSecond = ' phénoménale'
            const filename = (filenameFirst + filenameSecond).normalize('NFD')

            let file
            beforeEach(async function() {
              file = await builders
                .metafile()
                .path(
                  filenameFirst.normalize('NFD') +
                    filenameSecond.normalize('NFC')
                )
                .data('initial content')
                .upToDate()
                .create()
            })

            it('reuses the existing file name', async function() {
              const changes = [
                {
                  type: 'DirMove',
                  path: dstDirPath,
                  stats: { ino: 1 },
                  old: {
                    path: dir.path
                  }
                },
                {
                  type: 'FileMove',
                  path: path.join(dstDirPath, filename),
                  stats: { ino: 2 },
                  old: {
                    path: file.path
                  }
                }
              ]
              const [dirMove, fileMove] = await normalizePaths.step(
                changes,
                stepOptions(this)
              )
              should(dirMove).have.properties({
                path: dstDirPath
              })
              should(fileMove).have.properties({
                path: path.join(dstDirPath, path.basename(file.path))
              })
            })
          }
        )
      })

      context('when parent is saved with NFD encoded path in Pouch', () => {
        let dir
        beforeEach(async function() {
          dir = await builders
            .metadir()
            .path(srcDirPath.normalize('NFD'))
            .upToDate()
            .create()
        })

        context('when file is saved with NFC encoded name in Pouch', () => {
          let file
          beforeEach(async function() {
            file = await builders
              .metafile()
              .path(filename.normalize('NFC'))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('reuses the existing file name', async function() {
            const changes = [
              {
                type: 'DirMove',
                path: dstDirPath,
                stats: { ino: 1 },
                old: {
                  path: dir.path
                }
              },
              {
                type: 'FileMove',
                path: path.join(dstDirPath, filename),
                stats: { ino: 2 },
                old: {
                  path: file.path
                }
              }
            ]
            const [dirMove, fileMove] = await normalizePaths.step(
              changes,
              stepOptions(this)
            )
            should(dirMove).have.properties({
              path: dstDirPath
            })
            should(fileMove).have.properties({
              path: path.join(dstDirPath, path.basename(file.path))
            })
          })
        })

        context('when file is saved with NFD encoded name in Pouch', () => {
          let file
          beforeEach(async function() {
            file = await builders
              .metafile()
              .path(filename.normalize('NFD'))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('reuses the existing file name', async function() {
            const changes = [
              {
                type: 'DirMove',
                path: dstDirPath,
                stats: { ino: 1 },
                old: {
                  path: dir.path
                }
              },
              {
                type: 'FileMove',
                path: path.join(dstDirPath, filename),
                stats: { ino: 2 },
                old: {
                  path: file.path
                }
              }
            ]
            const [dirMove, fileMove] = await normalizePaths.step(
              changes,
              stepOptions(this)
            )
            should(dirMove).have.properties({
              path: dstDirPath
            })
            should(fileMove).have.properties({
              path: path.join(dstDirPath, path.basename(file.path))
            })
          })
        })

        context(
          'when file is saved with neither NFD nor NFC encoded name in Pouch',
          () => {
            const filenameFirst = 'Réussite'
            const filenameSecond = ' phénoménale'
            const filename = (filenameFirst + filenameSecond).normalize('NFD')

            let file
            beforeEach(async function() {
              file = await builders
                .metafile()
                .path(
                  filenameFirst.normalize('NFD') +
                    filenameSecond.normalize('NFC')
                )
                .data('initial content')
                .upToDate()
                .create()
            })

            it('reuses the existing file name', async function() {
              const changes = [
                {
                  type: 'DirMove',
                  path: dstDirPath,
                  stats: { ino: 1 },
                  old: {
                    path: dir.path
                  }
                },
                {
                  type: 'FileMove',
                  path: path.join(dstDirPath, filename),
                  stats: { ino: 2 },
                  old: {
                    path: file.path
                  }
                }
              ]
              const [dirMove, fileMove] = await normalizePaths.step(
                changes,
                stepOptions(this)
              )
              should(dirMove).have.properties({
                path: dstDirPath
              })
              should(fileMove).have.properties({
                path: path.join(dstDirPath, path.basename(file.path))
              })
            })
          }
        )
      })

      context(
        'when parent is saved with neither NFD nor NFC encoded path in Pouch',
        () => {
          const dirPath =
            'Énoncés'.normalize('NFD') + 'et corrigés'.normalize('NFC')
          const dstDirPath =
            'Énoncés'.normalize('NFD') + '/ corrigés'.normalize('NFC')

          let dir
          beforeEach(async function() {
            dir = await builders
              .metadir()
              .path(dirPath)
              .upToDate()
              .create()
          })

          context('when file is saved with NFC encoded name in Pouch', () => {
            let file
            beforeEach(async function() {
              file = await builders
                .metafile()
                .path(filename.normalize('NFC'))
                .data('initial content')
                .upToDate()
                .create()
            })

            it('reuses the existing file name', async function() {
              const changes = [
                {
                  type: 'DirMove',
                  path: dstDirPath,
                  stats: { ino: 1 },
                  old: {
                    path: dir.path
                  }
                },
                {
                  type: 'FileMove',
                  path: path.join(dstDirPath, filename),
                  stats: { ino: 2 },
                  old: {
                    path: file.path
                  }
                }
              ]
              const [dirMove, fileMove] = await normalizePaths.step(
                changes,
                stepOptions(this)
              )
              should(dirMove).have.properties({
                path: dstDirPath
              })
              should(fileMove).have.properties({
                path: path.join(dstDirPath, path.basename(file.path))
              })
            })
          })

          context('when file is saved with NFD encoded name in Pouch', () => {
            let file
            beforeEach(async function() {
              file = await builders
                .metafile()
                .path(filename.normalize('NFD'))
                .data('initial content')
                .upToDate()
                .create()
            })

            it('reuses the existing file name', async function() {
              const changes = [
                {
                  type: 'DirMove',
                  path: dstDirPath,
                  stats: { ino: 1 },
                  old: {
                    path: dir.path
                  }
                },
                {
                  type: 'FileMove',
                  path: path.join(dstDirPath, filename),
                  stats: { ino: 2 },
                  old: {
                    path: file.path
                  }
                }
              ]
              const [dirMove, fileMove] = await normalizePaths.step(
                changes,
                stepOptions(this)
              )
              should(dirMove).have.properties({
                path: dstDirPath
              })
              should(fileMove).have.properties({
                path: path.join(dstDirPath, path.basename(file.path))
              })
            })
          })

          context(
            'when file is saved with neither NFD nor NFC encoded name in Pouch',
            () => {
              const srcFilename =
                'Réussite'.normalize('NFD') + ' phénoménale'.normalize('NFC')
              const dstFilename =
                'Échec'.normalize('NFD') + ' inconséquent'.normalize('NFC')

              let file
              beforeEach(async function() {
                file = await builders
                  .metafile()
                  .path(srcFilename)
                  .data('initial content')
                  .upToDate()
                  .create()
              })

              it('does not normalize the new paths', async function() {
                const changes = [
                  {
                    type: 'DirMove',
                    path: dstDirPath,
                    stats: { ino: 1 },
                    old: {
                      path: dir.path
                    }
                  },
                  {
                    type: 'FileMove',
                    path: path.join(dstDirPath, dstFilename),
                    stats: { ino: 2 },
                    old: {
                      path: file.path
                    }
                  }
                ]
                const [dirMove, fileMove] = await normalizePaths.step(
                  changes,
                  stepOptions(this)
                )
                should(dirMove).have.properties({
                  path: dstDirPath
                })
                should(fileMove).have.properties({
                  path: path.join(dstDirPath, dstFilename)
                })
              })
            }
          )
        }
      )
    })
  })
})

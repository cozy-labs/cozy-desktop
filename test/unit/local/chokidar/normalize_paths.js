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

    beforeEach('set up builders', function () {
      builders = new Builders({ pouch: this.pouch })
    })

    afterEach('clean pouch', pouchHelpers.cleanDatabase)
    after('clean config directory', configHelpers.cleanConfig)

    describe('added file in dir on filesystem normalizing with NFD', () => {
      const dirPath = 'corrigés'.normalize('NFD')
      const filename = 'Réussite'.normalize('NFD')

      context('when parent is saved with NFC encoded path in Pouch', () => {
        beforeEach(async function () {
          await builders
            .metadir()
            .path(dirPath.normalize('NFC'))
            .upToDate()
            .create()
        })

        it('normalizes only parent part of file path with NFC', async function () {
          const changes = [
            {
              type: 'FileAddition',
              path: path.join(dirPath, filename),
              stats: { ino: 1 }
            }
          ]
          const [change] = await normalizePaths.step(changes, stepOptions(this))
          should(change).have.properties({
            path: path.join(dirPath.normalize('NFC'), filename.normalize('NFD'))
          })
        })
      })

      context('when parent is saved with NFD encoded path in Pouch', () => {
        beforeEach(async function () {
          await builders
            .metadir()
            .path(dirPath.normalize('NFD'))
            .upToDate()
            .create()
        })

        it('does not normalize parent part of file path with NFC', async function () {
          const changes = [
            {
              type: 'FileAddition',
              path: path.join(dirPath, filename),
              stats: { ino: 1 }
            }
          ]
          const [change] = await normalizePaths.step(changes, stepOptions(this))
          should(change).have.properties({
            path: path.join(dirPath.normalize('NFD'), filename.normalize('NFD'))
          })
        })
      })
    })

    describe('changed file in dir on filesystem normalizing with NFD', () => {
      const dirPath = 'corrigés'.normalize('NFD')
      const filename = 'Réussite'.normalize('NFD')

      context('when parent is saved with NFC encoded path in Pouch', () => {
        let dir
        beforeEach(async function () {
          dir = await builders
            .metadir()
            .path(dirPath.normalize('NFC'))
            .upToDate()
            .create()
        })

        context('when file is saved with NFC encoded name in Pouch', () => {
          let file
          beforeEach(async function () {
            file = await builders
              .metafile()
              .path(path.join(dir.path, filename.normalize('NFC')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('normalizes file path with NFC', async function () {
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
                path: file.path.normalize('NFC')
              },
              FileDeletion: {
                path: file.path.normalize('NFC')
              }
            })
          })
        })

        context('when file is saved with NFD encoded name in Pouch', () => {
          let file
          beforeEach(async function () {
            file = await builders
              .metafile()
              .path(path.join(dir.path, filename.normalize('NFD')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('normalizes only parent part of file path with NFC', async function () {
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
                path: path.join(
                  dirPath.normalize('NFC'),
                  filename.normalize('NFD')
                )
              },
              FileDeletion: {
                path: path.join(
                  dirPath.normalize('NFC'),
                  filename.normalize('NFD')
                )
              }
            })
          })
        })
      })

      context('when parent is saved with NFD encoded path in Pouch', () => {
        let dir
        beforeEach(async function () {
          dir = await builders
            .metadir()
            .path(dirPath.normalize('NFD'))
            .upToDate()
            .create()
        })

        context('when file is saved with NFC encoded name in Pouch', () => {
          let file
          beforeEach(async function () {
            file = await builders
              .metafile()
              .path(path.join(dir.path, filename.normalize('NFC')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('normalizes only file name with NFC', async function () {
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
                path: path.join(
                  dirPath.normalize('NFD'),
                  filename.normalize('NFC')
                )
              },
              FileDeletion: {
                path: path.join(
                  dirPath.normalize('NFD'),
                  filename.normalize('NFC')
                )
              }
            })
          })
        })

        context('when file is saved with NFD encoded name in Pouch', () => {
          let file
          beforeEach(async function () {
            file = await builders
              .metafile()
              .path(path.join(dir.path, filename.normalize('NFD')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('does not normalize file path with NFC', async function () {
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
                path: file.path.normalize('NFD')
              },
              FileDeletion: {
                path: file.path.normalize('NFD')
              }
            })
          })
        })
      })
    })

    describe('renamed dir with child on filesystem normalizing with NFD', () => {
      const srcDirPath = 'énoncés'.normalize('NFD')
      const dstDirPath = 'corrigés'.normalize('NFD')
      const filename = 'Réussite'.normalize('NFD')

      context('when parent is saved with NFC encoded path in Pouch', () => {
        let dir
        beforeEach(async function () {
          dir = await builders
            .metadir()
            .path(srcDirPath.normalize('NFC'))
            .upToDate()
            .create()
        })

        context('when file is saved with NFC encoded name in Pouch', () => {
          let file
          beforeEach(async function () {
            file = await builders
              .metafile()
              .path(path.join(dir.path, filename.normalize('NFC')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('normalizes new dir and file paths with NFC', async function () {
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
              path: dstDirPath.normalize('NFC')
            })
            should(fileMove).have.properties({
              path: path.join(dstDirPath, filename).normalize('NFC')
            })
          })
        })

        context('when file is saved with NFD encoded name in Pouch', () => {
          let file
          beforeEach(async function () {
            file = await builders
              .metafile()
              .path(path.join(dir.path, filename.normalize('NFD')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('normalizes only parent part of file path with NFC', async function () {
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
              path: dstDirPath.normalize('NFC')
            })
            should(fileMove).have.properties({
              path: path.join(
                dstDirPath.normalize('NFC'),
                filename.normalize('NFD')
              )
            })
          })
        })
      })

      context('when parent is saved with NFD encoded path in Pouch', () => {
        let dir
        beforeEach(async function () {
          dir = await builders
            .metadir()
            .path(srcDirPath.normalize('NFD'))
            .upToDate()
            .create()
        })

        context('when file is saved with NFC encoded name in Pouch', () => {
          let file
          beforeEach(async function () {
            file = await builders
              .metafile()
              .path(path.join(dir.path, filename.normalize('NFC')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('normalizes file name with NFC', async function () {
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
              path: dstDirPath.normalize('NFD')
            })
            should(fileMove).have.properties({
              path: path.join(
                dstDirPath.normalize('NFD'),
                filename.normalize('NFC')
              )
            })
          })
        })

        context('when file is saved with NFD encoded name in Pouch', () => {
          let file
          beforeEach(async function () {
            file = await builders
              .metafile()
              .path(path.join(dir.path, filename.normalize('NFD')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('does not normalize new dir or file paths with NFC', async function () {
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
              path: dstDirPath.normalize('NFD')
            })
            should(fileMove).have.properties({
              path: path.join(
                dstDirPath.normalize('NFD'),
                filename.normalize('NFD')
              )
            })
          })
        })
      })
    })

    describe('renamed file in dir on filesystem normalizing with NFD', () => {
      const dirPath = 'corrigés'.normalize('NFD')
      const srcFilename = 'Réussite'.normalize('NFD')
      const dstFilename = 'Échec'.normalize('NFD')

      context('when parent is saved with NFC encoded path in Pouch', () => {
        let dir
        beforeEach(async function () {
          dir = await builders
            .metadir()
            .path(dirPath.normalize('NFC'))
            .upToDate()
            .create()
        })

        context('when file is saved with NFC encoded name in Pouch', () => {
          let file
          beforeEach(async function () {
            file = await builders
              .metafile()
              .path(path.join(dir.path, srcFilename.normalize('NFC')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('normalizes new file path with NFC', async function () {
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
              path: path.join(dirPath, dstFilename).normalize('NFC')
            })
          })
        })

        context('when file is saved with NFD encoded name in Pouch', () => {
          let file
          beforeEach(async function () {
            file = await builders
              .metafile()
              .path(path.join(dir.path, srcFilename.normalize('NFD')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('normalizes only parent part of file path with NFC', async function () {
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
              path: path.join(
                dirPath.normalize('NFC'),
                dstFilename.normalize('NFD')
              )
            })
          })
        })
      })

      context('when parent is saved with NFD encoded path in Pouch', () => {
        let dir
        beforeEach(async function () {
          dir = await builders
            .metadir()
            .path(dirPath.normalize('NFD'))
            .upToDate()
            .create()
        })

        context('when file is saved with NFC encoded name in Pouch', () => {
          let file
          beforeEach(async function () {
            file = await builders
              .metafile()
              .path(path.join(dir.path, srcFilename.normalize('NFC')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('normalizes file name with NFC', async function () {
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
              path: path.join(
                dirPath.normalize('NFD'),
                dstFilename.normalize('NFC')
              )
            })
          })
        })

        context('when file is saved with NFD encoded name in Pouch', () => {
          let file
          beforeEach(async function () {
            file = await builders
              .metafile()
              .path(path.join(dir.path, srcFilename.normalize('NFD')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('does not normalize new dir or file paths with NFC', async function () {
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
              path: path.join(
                dirPath.normalize('NFD'),
                dstFilename.normalize('NFD')
              )
            })
          })
        })
      })
    })

    describe('renamed file in renamed dir on filesystem normalizing with NFD', () => {
      const srcDirPath = 'énoncés'.normalize('NFD')
      const dstDirPath = 'corrigés'.normalize('NFD')
      const srcFilename = 'Réussite'.normalize('NFD')
      const dstFilename = 'Échec'.normalize('NFD')

      context('when parent is saved with NFC encoded path in Pouch', () => {
        let dir
        beforeEach(async function () {
          dir = await builders
            .metadir()
            .path(srcDirPath.normalize('NFC'))
            .upToDate()
            .create()
        })

        context('when file is saved with NFC encoded name in Pouch', () => {
          let file
          beforeEach(async function () {
            file = await builders
              .metafile()
              .path(path.join(dir.path, srcFilename.normalize('NFC')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('normalizes new dir and file paths with NFC', async function () {
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
              path: dstDirPath.normalize('NFC')
            })
            should(fileMove).have.properties({
              path: path.join(dstDirPath, dstFilename).normalize('NFC')
            })
          })
        })

        context('when file is saved with NFD encoded name in Pouch', () => {
          let file
          beforeEach(async function () {
            file = await builders
              .metafile()
              .path(path.join(dir.path, srcFilename.normalize('NFD')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('normalizes only parent part of file path with NFC', async function () {
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
              path: dstDirPath.normalize('NFC')
            })
            should(fileMove).have.properties({
              path: path.join(
                dstDirPath.normalize('NFC'),
                dstFilename.normalize('NFD')
              )
            })
          })
        })
      })

      context('when parent is saved with NFD encoded path in Pouch', () => {
        let dir
        beforeEach(async function () {
          dir = await builders
            .metadir()
            .path(srcDirPath.normalize('NFD'))
            .upToDate()
            .create()
        })

        context('when file is saved with NFC encoded name in Pouch', () => {
          let file
          beforeEach(async function () {
            file = await builders
              .metafile()
              .path(path.join(dir.path, srcFilename.normalize('NFC')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('normalizes file name with NFC', async function () {
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
              path: dstDirPath.normalize('NFD')
            })
            should(fileMove).have.properties({
              path: path.join(
                dstDirPath.normalize('NFD'),
                dstFilename.normalize('NFC')
              )
            })
          })
        })

        context('when file is saved with NFD encoded name in Pouch', () => {
          let file
          beforeEach(async function () {
            file = await builders
              .metafile()
              .path(path.join(dir.path, srcFilename.normalize('NFD')))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('does not normalize new dir or file paths with NFC', async function () {
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
              path: dstDirPath.normalize('NFD')
            })
            should(fileMove).have.properties({
              path: path.join(
                dstDirPath.normalize('NFD'),
                dstFilename.normalize('NFD')
              )
            })
          })
        })
      })
    })

    describe('moved file to renamed dir on filesystem normalizing with NFD', () => {
      const srcDirPath = 'énoncés'.normalize('NFD')
      const dstDirPath = 'corrigés'.normalize('NFD')
      const srcFilename = 'Réussite'.normalize('NFD')
      const dstFilename = 'Échec'.normalize('NFD')

      context('when parent is saved with NFC encoded path in Pouch', () => {
        let dir
        beforeEach(async function () {
          dir = await builders
            .metadir()
            .path(srcDirPath.normalize('NFC'))
            .upToDate()
            .create()
        })

        context('when file is saved with NFC encoded name in Pouch', () => {
          let file
          beforeEach(async function () {
            file = await builders
              .metafile()
              .path(srcFilename.normalize('NFC'))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('normalizes new dir and file paths with NFC', async function () {
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
              path: dstDirPath.normalize('NFC')
            })
            should(fileMove).have.properties({
              path: path.join(dstDirPath, dstFilename).normalize('NFC')
            })
          })
        })

        context('when file is saved with NFD encoded name in Pouch', () => {
          let file
          beforeEach(async function () {
            file = await builders
              .metafile()
              .path(srcFilename.normalize('NFD'))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('normalizes only parent part of file path with NFC', async function () {
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
              path: dstDirPath.normalize('NFC')
            })
            should(fileMove).have.properties({
              path: path.join(
                dstDirPath.normalize('NFC'),
                dstFilename.normalize('NFD')
              )
            })
          })
        })
      })

      context('when parent is saved with NFD encoded path in Pouch', () => {
        let dir
        beforeEach(async function () {
          dir = await builders
            .metadir()
            .path(srcDirPath.normalize('NFD'))
            .upToDate()
            .create()
        })

        context('when file is saved with NFC encoded name in Pouch', () => {
          let file
          beforeEach(async function () {
            file = await builders
              .metafile()
              .path(srcFilename.normalize('NFC'))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('normalizes file name with NFC', async function () {
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
              path: dstDirPath.normalize('NFD')
            })
            should(fileMove).have.properties({
              path: path.join(
                dstDirPath.normalize('NFD'),
                dstFilename.normalize('NFC')
              )
            })
          })
        })

        context('when file is saved with NFD encoded name in Pouch', () => {
          let file
          beforeEach(async function () {
            file = await builders
              .metafile()
              .path(srcFilename.normalize('NFD'))
              .data('initial content')
              .upToDate()
              .create()
          })

          it('does not normalize new dir or file paths with NFC', async function () {
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
              path: dstDirPath.normalize('NFD')
            })
            should(fileMove).have.properties({
              path: path.join(
                dstDirPath.normalize('NFD'),
                dstFilename.normalize('NFD')
              )
            })
          })
        })
      })
    })
  })
})

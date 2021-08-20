/* eslint-env mocha */
/* @flow */

const Promise = require('bluebird')
const _ = require('lodash')
const path = require('path')
const should = require('should')

const Channel = require('../../../../core/local/atom/channel')
const winDetectMove = require('../../../../core/local/atom/win_detect_move')

const Builders = require('../../../support/builders')
const configHelpers = require('../../../support/helpers/config')
const pouchHelpers = require('../../../support/helpers/pouch')

if (process.platform === 'win32') {
  const timesAsync = (count, fn) => Promise.mapSeries(_.range(count), fn)

  describe('core/local/atom/win_detect_move', () => {
    let builders

    before('instanciate config', configHelpers.createConfig)
    beforeEach('instanciate pouch', pouchHelpers.createDatabase)
    afterEach('clean pouch', pouchHelpers.cleanDatabase)
    after('clean config directory', configHelpers.cleanConfig)

    beforeEach(function() {
      builders = new Builders(this)
    })

    describe('.loop()', () => {
      let inputChannel, outputChannel

      beforeEach(async function() {
        this.state = await winDetectMove.initialState()
        inputChannel = new Channel()
        outputChannel = winDetectMove.loop(inputChannel, this)
      })

      const inputBatch = events => inputChannel.push(_.cloneDeep(events))
      const outputBatch = () => outputChannel.pop()

      const metadataBuilderByKind = (kind, old) => {
        switch (kind) {
          case 'file':
            return builders.metafile(old)
          case 'directory':
            return builders.metadir(old)
          default:
            throw new Error(
              `Cannot find metadata builder for ${JSON.stringify(kind)}`
            )
        }
      }

      for (const kind of ['file', 'directory']) {
        describe(`deleted ${kind} (matching doc)`, () => {
          const srcIno = 1
          const srcPath = 'src'
          let srcDoc, deletedEvent

          beforeEach(async () => {
            srcDoc = await metadataBuilderByKind(kind)
              .path(srcPath)
              .ino(srcIno)
              .upToDate()
              .create()
            deletedEvent = builders
              .event()
              .action('deleted')
              .kind(kind)
              .path(srcPath)
              .deletedIno(srcIno)
              .build()
          })

          describe(`+ created ${kind} (same path, different fileid)`, () => {
            const differentIno = srcIno + 1
            let createdEvent

            beforeEach(async () => {
              createdEvent = builders
                .event()
                .action('created')
                .kind(kind)
                .path(srcPath)
                .ino(differentIno)
                .build()
            })

            it(`is a replaced ${kind} (not aggregated)`, async function() {
              inputBatch([deletedEvent, createdEvent])
              should(await outputBatch()).deepEqual([deletedEvent])
              should(await outputBatch()).deepEqual([createdEvent])
            })
          })

          describe(`+ created ${kind} (different path, same fileid)`, () => {
            const dstPath = 'dst'
            let createdEvent

            beforeEach(async () => {
              createdEvent = builders
                .event()
                .action('created')
                .kind(kind)
                .path(dstPath)
                .ino(srcIno)
                .build()
            })

            context('when doc has not been moved in PouchDB', () => {
              it(`is a renamed ${kind} (aggregated)`, async function() {
                inputBatch([deletedEvent, createdEvent])
                should(await outputBatch()).deepEqual([
                  {
                    action: 'renamed',
                    kind,
                    oldPath: srcPath,
                    path: dstPath,
                    stats: createdEvent.stats,
                    winDetectMove: {
                      aggregatedEvents: { createdEvent, deletedEvent }
                    }
                  }
                ])
              })
            })

            context('when doc has been moved in PouchDB', () => {
              beforeEach(async () => {
                const deletedSrc = await metadataBuilderByKind(kind, srcDoc)
                  .upToDate()
                  .create()
                await metadataBuilderByKind(kind)
                  .moveFrom(deletedSrc)
                  .path(dstPath)
                  .upToDate()
                  .create()
              })

              it(`is a renamed ${kind} (aggregated)`, async function() {
                inputBatch([deletedEvent, createdEvent])
                should(await outputBatch()).deepEqual([
                  {
                    action: 'renamed',
                    kind,
                    oldPath: srcPath,
                    path: dstPath,
                    stats: createdEvent.stats,
                    winDetectMove: {
                      aggregatedEvents: { createdEvent, deletedEvent }
                    }
                  }
                ])
              })
            })

            if (kind === 'directory') {
              for (const childKind of ['directory']) {
                describe(`+ deleted child ${childKind} (missing doc because path changed)`, () => {
                  const childIno = 2
                  const childName = `sub${childKind}`
                  const childTmpPath = path.join(dstPath, childName)
                  let deletedChildEvent

                  beforeEach(async () => {
                    await builders
                      .metadir()
                      .path(path.join(srcPath, childName))
                      .ino(childIno)
                      .upToDate()
                      .create()
                    deletedChildEvent = builders
                      .event()
                      .action('deleted')
                      .kind(childKind)
                      .path(childTmpPath)
                      .build()
                  })

                  describe(`+ created child ${childKind} (path outside parent)`, () => {
                    const childDstPath = childName
                    let createdChildEvent

                    beforeEach(async () => {
                      createdChildEvent = builders
                        .event()
                        .action('created')
                        .kind(childKind)
                        .path(childDstPath)
                        .ino(childIno)
                        .build()
                      inputBatch([deletedEvent])
                      inputBatch([createdEvent])
                      inputBatch([deletedChildEvent])
                      inputBatch([createdChildEvent])
                    })

                    it(`is a renamed child ${childKind} (aggregated)`, async function() {
                      const outputBatches = [
                        await outputBatch(),
                        await outputBatch()
                      ]
                      //  await timesAsync(2, outputBatch)
                      should(outputBatches).deepEqual([
                        [
                          {
                            action: 'renamed',
                            kind,
                            oldPath: srcPath,
                            path: dstPath,
                            stats: createdEvent.stats,
                            winDetectMove: {
                              aggregatedEvents: {
                                createdEvent,
                                deletedEvent
                              }
                            }
                          }
                        ],
                        [
                          {
                            action: 'renamed',
                            kind: childKind,
                            oldPath: childTmpPath,
                            path: childDstPath,
                            stats: createdChildEvent.stats,
                            winDetectMove: {
                              aggregatedEvents: {
                                createdEvent: createdChildEvent,
                                deletedEvent: {
                                  ...deletedChildEvent,
                                  winDetectMove: {
                                    oldPaths: [path.join(srcPath, childName)]
                                  }
                                }
                              }
                            }
                          }
                        ]
                      ])
                    })
                  })
                })
              }
            }
          })

          describe(`+ created ${kind} (same path, same fileid)`, () => {
            let createdEvent

            beforeEach(async () => {
              createdEvent = builders
                .event()
                .action('created')
                .kind(kind)
                .path(srcPath)
                .ino(srcIno)
                .build()
            })

            it(`is untouched`, async function() {
              inputBatch([deletedEvent, createdEvent])
              should(await outputBatch()).deepEqual([deletedEvent])
              should(await outputBatch()).deepEqual([createdEvent])
            })
          })

          describe(`+ created ${kind} (temporary path, incomplete)`, () => {
            const tmpPath = 'tmp'
            let createdTmpEvent

            beforeEach(async () => {
              createdTmpEvent = builders
                .event()
                .action('created')
                .kind(kind)
                .path(tmpPath)
                .incomplete()
                .build()
              // XXX: ino?
            })

            describe(`+ deleted ${kind} (temporary path, missing doc)`, () => {
              let deletedTmpEvent

              beforeEach(async () => {
                deletedTmpEvent = builders
                  .event()
                  .action('deleted')
                  .kind(kind)
                  .path(tmpPath)
                  .build()
              })

              describe(`+ created ${kind} (different path, same fileid)`, () => {
                const dstPath = 'dst'
                let createdDstEvent

                beforeEach(async () => {
                  createdDstEvent = builders
                    .event()
                    .action('created')
                    .kind(kind)
                    .path(dstPath)
                    .ino(srcIno)
                    .build()
                })

                it(`is a temporary ${kind} (not aggregated) + a renamed ${kind} (aggregated)`, async () => {
                  inputBatch([deletedEvent, createdTmpEvent])
                  inputBatch([deletedTmpEvent])
                  inputBatch([createdDstEvent])
                  const outputBatches = await Promise.mapSeries(
                    _.range(3),
                    outputBatch
                  )
                  should(outputBatches).deepEqual([
                    [createdTmpEvent],
                    [
                      _.defaults(
                        {
                          winDetectMove: { deletedIno: 'unresolved' }
                        },
                        deletedTmpEvent
                      )
                    ],
                    [
                      {
                        action: 'renamed',
                        kind,
                        oldPath: srcPath,
                        path: dstPath,
                        stats: createdDstEvent.stats,
                        winDetectMove: {
                          aggregatedEvents: {
                            deletedEvent,
                            createdEvent: createdDstEvent
                          }
                        }
                      }
                    ]
                  ])
                })
              })
            })
          })
        })

        // START
        describe(`created ${kind}`, () => {
          const createdIno = 1
          const createdPath = 'dst'
          let createdEvent

          beforeEach(async () => {
            createdEvent = builders
              .event()
              .action('created')
              .kind(kind)
              .path(createdPath)
              .ino(createdIno)
              .build()
          })

          describe(`+ deleted ${kind} (different path, same fileid)`, () => {
            const deletedPath = 'src'
            let deletedEvent

            beforeEach(async () => {
              await metadataBuilderByKind(kind)
                .path(deletedPath)
                .ino(createdIno)
                .upToDate()
                .create()
              deletedEvent = builders
                .event()
                .action('deleted')
                .kind(kind)
                .path(deletedPath)
                .deletedIno(createdIno)
                .build()
            })

            it(`is a renamed ${kind} (aggregated)`, async function() {
              inputBatch([createdEvent, deletedEvent])
              should(await outputBatch()).deepEqual([
                {
                  action: 'renamed',
                  kind,
                  oldPath: deletedPath,
                  path: createdPath,
                  stats: createdEvent.stats,
                  winDetectMove: {
                    aggregatedEvents: { createdEvent, deletedEvent }
                  }
                }
              ])
            })

            if (kind === 'directory') {
              for (const childKind of ['directory']) {
                describe(`+ deleted child ${childKind} (missing doc because path changed)`, () => {
                  const childIno = createdIno + 2
                  const childName = `sub${childKind}`
                  const childTmpPath = path.join(createdPath, childName)
                  let deletedChildEvent

                  beforeEach(async () => {
                    await metadataBuilderByKind(childKind)
                      .path(path.join(deletedPath, childName))
                      .ino(childIno)
                      .upToDate()
                      .create()
                    deletedChildEvent = builders
                      .event()
                      .action('deleted')
                      .kind(childKind)
                      .path(childTmpPath)
                      .build()
                  })

                  describe(`+ created child ${childKind} (path outside parent)`, () => {
                    const childDstPath = childName
                    let createdChildEvent

                    beforeEach(async () => {
                      createdChildEvent = builders
                        .event()
                        .action('created')
                        .kind(childKind)
                        .path(childDstPath)
                        .ino(childIno)
                        .build()
                      inputBatch([createdEvent])
                      inputBatch([deletedEvent])
                      inputBatch([createdChildEvent])
                      inputBatch([deletedChildEvent])
                    })

                    it(`is a renamed child ${childKind} (aggregated)`, async function() {
                      const outputBatches = await timesAsync(2, outputBatch)
                      should(outputBatches).deepEqual([
                        [
                          {
                            action: 'renamed',
                            kind,
                            oldPath: deletedPath,
                            path: createdPath,
                            stats: createdEvent.stats,
                            winDetectMove: {
                              aggregatedEvents: {
                                createdEvent,
                                deletedEvent
                              }
                            }
                          }
                        ],
                        [
                          {
                            action: 'renamed',
                            kind: childKind,
                            oldPath: childTmpPath,
                            path: childDstPath,
                            stats: createdChildEvent.stats,
                            winDetectMove: {
                              aggregatedEvents: {
                                createdEvent: createdChildEvent,
                                deletedEvent: {
                                  ...deletedChildEvent,
                                  winDetectMove: {
                                    oldPaths: [
                                      path.join(deletedPath, childName)
                                    ]
                                  }
                                }
                              }
                            }
                          }
                        ]
                      ])
                    })
                  })
                })
              }
            }
          })

          describe(`+ deleted ${kind} (same path, same fileid)`, () => {
            let deletedEvent

            beforeEach(async () => {
              await metadataBuilderByKind(kind)
                .path(createdPath)
                .ino(createdIno)
                .upToDate()
                .create()
              deletedEvent = builders
                .event()
                .action('deleted')
                .kind(kind)
                .path(createdPath)
                .deletedIno(createdIno)
                .build()
            })

            it(`is an ignored ${kind} (aggregated)`, async function() {
              inputBatch([createdEvent, deletedEvent])
              should(await outputBatch()).deepEqual([
                {
                  action: 'ignored',
                  kind,
                  path: createdPath,
                  stats: createdEvent.stats,
                  winDetectMove: {
                    aggregatedEvents: { createdEvent, deletedEvent }
                  }
                }
              ])
            })
          })
        })

        describe(`created ${kind} (incomplete)`, () => {
          let createdEvent

          beforeEach(async () => {
            createdEvent = builders
              .event()
              .action('created')
              .kind(kind)
              .ino(1)
              .build()
          })

          describe(`+ deleted ${kind} (same path, missing doc)`, () => {
            let deletedEvent

            beforeEach(async () => {
              deletedEvent = builders
                .event()
                .action('deleted')
                .kind(kind)
                .path(createdEvent.path)
                .build()
            })

            it(`is a temporary ${kind} (not aggregated)`, async function() {
              inputBatch([createdEvent, deletedEvent])
              should(await outputBatch()).deepEqual([createdEvent])
              should(await outputBatch()).deepEqual([
                _.defaults(
                  { winDetectMove: { deletedIno: 'unresolved' } },
                  deletedEvent
                )
              ])
            })
          })
        })

        describe(`ignored ${kind}`, () => {
          let ignoredEvent

          beforeEach(async () => {
            ignoredEvent = builders
              .event()
              .action('ignored')
              .kind(kind)
              .build()
          })

          it('is untouched', async function() {
            inputBatch([ignoredEvent])
            should(await outputBatch()).deepEqual([ignoredEvent])
          })
        })
      }
    })
  })
}

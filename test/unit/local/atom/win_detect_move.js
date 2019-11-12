/* eslint-env mocha */
/* @flow */

const Promise = require('bluebird')
const _ = require('lodash')
const path = require('path')
const should = require('should')

const Channel = require('../../../../core/local/atom/channel')
const winDetectMove = require('../../../../core/local/atom/win_detect_move')
const metadata = require('../../../../core/metadata')

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

      const metadataBuilderByKind = kind => {
        switch (kind) {
          case 'file':
            return builders.metafile()
          case 'directory':
            return builders.metadir()
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
          let deletedEvent

          beforeEach(async () => {
            await metadataBuilderByKind(kind)
              .path(srcPath)
              .ino(srcIno)
              .create()
            deletedEvent = builders
              .event()
              .action('deleted')
              .kind(kind)
              .path(srcPath)
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

            it(`is a renamed ${kind} (aggregated)`, async function() {
              inputBatch([deletedEvent, createdEvent])
              should(await outputBatch()).deepEqual([
                {
                  _id: metadata.id(dstPath),
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
                      const outputBatches = await timesAsync(2, outputBatch)
                      should(outputBatches).deepEqual([
                        [
                          {
                            _id: metadata.id(dstPath),
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
                            _id: metadata.id(childDstPath),
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

            it(`is an ignored ${kind} (aggregated)`, async function() {
              inputBatch([deletedEvent, createdEvent])
              should(await outputBatch()).deepEqual([
                {
                  _id: metadata.id(srcPath),
                  action: 'ignored',
                  kind,
                  path: srcPath,
                  stats: createdEvent.stats,
                  winDetectMove: {
                    aggregatedEvents: { createdEvent, deletedEvent }
                  }
                }
              ])
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
                        _id: metadata.id(dstPath),
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

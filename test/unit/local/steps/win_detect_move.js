/* eslint-env mocha */
/* @flow */

const Promise = require('bluebird')
const _ = require('lodash')
const should = require('should')

const Buffer = require('../../../../core/local/steps/buffer')
const winDetectMove = require('../../../../core/local/steps/win_detect_move')
const metadata = require('../../../../core/metadata')

const Builders = require('../../../support/builders')
const configHelpers = require('../../../support/helpers/config')
const pouchHelpers = require('../../../support/helpers/pouch')

if (process.platform === 'win32') {
  describe('core/local/steps/win_detect_move', () => {
    let builders

    before('instanciate config', configHelpers.createConfig)
    beforeEach('instanciate pouch', pouchHelpers.createDatabase)
    afterEach('clean pouch', pouchHelpers.cleanDatabase)
    after('clean config directory', configHelpers.cleanConfig)

    beforeEach(function () {
      builders = new Builders(this)
    })

    describe('.loop()', () => {
      let inputBuffer, outputBuffer

      beforeEach(function () {
        inputBuffer = new Buffer()
        outputBuffer = winDetectMove.loop(inputBuffer, this)
      })

      const inputBatch = events => inputBuffer.push(events)
      const outputBatch = () => outputBuffer.pop()

      const metadataBuilderByKind = kind => {
        switch (kind) {
          case 'file': return builders.metafile()
          case 'directory': return builders.metadir()
          default: throw new Error(`Cannot find metadata builder for ${JSON.stringify(kind)}`)
        }
      }

      for (const kind of ['file', 'directory']) {
        describe(`deleted ${kind} (matching doc)`, () => {
          const srcIno = 1
          const srcPath = 'src'
          let deletedEvent

          beforeEach(async () => {
            await metadataBuilderByKind(kind).path(srcPath).ino(srcIno).create()
            deletedEvent = builders.event().action('deleted').kind(kind)
              .path(srcPath).build()
          })

          describe(`+ created ${kind} (same path, different fileid)`, () => {
            const differentIno = srcIno + 1
            let createdEvent

            beforeEach(async () => {
              createdEvent = builders.event().action('created').kind(kind)
                .path(srcPath).ino(differentIno).build()

              inputBatch([deletedEvent, createdEvent])
            })

            it(`is a replaced ${kind} (not aggregated)`, async function () {
              should(await outputBatch()).deepEqual([
                deletedEvent,
                createdEvent
              ])
            })
          })

          describe(`+ created ${kind} (different path, same fileid)`, () => {
            const dstPath = 'dst'
            let createdEvent

            beforeEach(async () => {
              createdEvent = builders.event().action('created').kind(kind)
                .path(dstPath).ino(srcIno).build()

              inputBatch([deletedEvent, createdEvent])
            })

            it(`is a renamed ${kind} (aggregated)`, async function () {
              should(await outputBatch()).deepEqual([
                {
                  _id: metadata.id(dstPath),
                  action: 'renamed',
                  kind,
                  oldPath: srcPath,
                  path: dstPath,
                  stats: createdEvent.stats,
                  winDetectMove: {aggregatedEvents: {createdEvent, deletedEvent}}
                }
              ])
            })
          })

          describe(`+ created ${kind} (temporary path, incomplete)`, () => {
            const tmpPath = 'tmp'
            let createdTmpEvent

            beforeEach(async () => {
              createdTmpEvent = builders.event().action('created').kind(kind)
                .path(tmpPath).incomplete().build()
              // XXX: ino?
              inputBatch([deletedEvent, createdTmpEvent])
            })

            describe(`+ deleted ${kind} (temporary path, missing doc)`, () => {
              let deletedTmpEvent

              beforeEach(async () => {
                deletedTmpEvent = builders.event().action('deleted').kind(kind)
                  .path(tmpPath).build()
                inputBatch([deletedTmpEvent])
              })

              describe(`+ created ${kind} (different path, same fileid)`, () => {
                const dstPath = 'dst'
                let createdDstEvent

                beforeEach(async () => {
                  createdDstEvent = builders.event().action('created').kind(kind)
                    .path(dstPath).ino(srcIno).build()
                  inputBatch([createdDstEvent])
                })

                it(`is a temporary ${kind} (not aggregated) + a renamed ${kind} (aggregated)`, async () => {
                  const outputBatches = await Promise.mapSeries(
                    _.range(3),
                    outputBatch
                  )
                  should(outputBatches).deepEqual([
                    [
                      createdTmpEvent
                    ],
                    [
                      _.defaults({
                        winDetectMove: {docNotFound: 'missing'}
                      }, deletedTmpEvent)
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
            createdEvent = builders.event().action('created').kind(kind)
              .ino(1).build()
          })

          describe(`+ deleted ${kind} (same path, missing doc)`, () => {
            let deletedEvent

            beforeEach(async () => {
              deletedEvent = builders.event().action('deleted').kind(kind)
                .path(createdEvent.path).build()

              inputBatch([createdEvent, deletedEvent])
            })

            it(`is a temporary ${kind} (not aggregated)`, async function () {
              should(await outputBatch()).deepEqual([
                createdEvent,
                _.defaults(
                  {winDetectMove: {docNotFound: 'missing'}},
                  deletedEvent
                )
              ])
            })
          })
        })
      }
    })
  })
}

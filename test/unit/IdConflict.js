/* @flow */
/* eslint-env mocha */

const should = require('should')

const Builders = require('../support/builders')
const { onPlatform, onPlatforms } = require('../support/helpers/platform')

const IdConflict = require('../../core/IdConflict')

const builders = new Builders()
const { platform } = process

describe('IdConflict', function () {
  const side = 'remote' // whatever

  describe('.detect()', () => {
    onPlatforms(['win32', 'darwin'], () => {
      it('returns an IdConflict object when a conflict exists between a new doc and an existing one', () => {
        const existingDoc = builders
          .metadata()
          .path('alfred')
          .remoteId('1')
          .upToDate()
          .build()
        const doc = builders
          .metadata()
          .path('Alfred')
          .remoteId('2')
          .sides({ remote: 1 })
          .build()
        should(IdConflict.detect({ side, doc }, existingDoc)).deepEqual({
          existingDoc,
          change: {
            doc,
            side
          },
          platform
        })
      })
    })

    onPlatform('linux', () => {
      it('returns nothing when a conflict would exist on other platforms', () => {
        const existingDoc = builders
          .metadata()
          .path('alfred')
          .remoteId('1')
          .upToDate()
          .build()
        const doc = builders
          .metadata()
          .path('Alfred')
          .remoteId('2')
          .sides({ remote: 1 })
          .build()
        should(IdConflict.detect({ side, doc }, existingDoc)).be.undefined()
      })
    })

    it('returns nothing when no conflict exists between a new doc and an existing one', () => {
      const existingDoc = builders
        .metadata()
        .path('alfred')
        .remoteId('1')
        .upToDate()
        .build()
      const doc = builders
        .metadata()
        .path('alfred2')
        .remoteId('2')
        .upToDate()
        .build()
      should(IdConflict.detect({ side, doc }, existingDoc)).be.undefined()
    })

    it('returns nothing when there is no existing doc', () => {
      const doc = builders
        .metadata()
        .path('Alfred')
        .remoteId('2')
        .sides({ remote: 1 })
        .build()
      should(IdConflict.detect({ side, doc })).be.undefined()
    })
  })

  describe('.detectOnId(change, existingDoc)', () => {
    const existingPath = 'existing'
    let existingDoc

    const pathDifferentFrom = (...paths) =>
      `different-from-${paths.join('/and/')}`

    const pathIdenticalTo = (path, upperCaseLength = 1) =>
      path.slice(0, upperCaseLength).toUpperCase() + path.slice(upperCaseLength)

    const assertIdConflict = (winOrMacResult, change) => {
      const expectedResult = platform === 'linux' ? false : winOrMacResult

      it(`is ${expectedResult.toString()} on ${platform} platform`, () => {
        should(IdConflict.detectOnId(change, existingDoc)).equal(expectedResult)
      })
    }

    beforeEach(() => {
      existingDoc = builders.metadata().path(existingPath).build()
    })

    describe('when change is an addition', () => {
      const addition = path => ({
        side,
        doc: builders.metadata().path(path).build()
      })

      describe('to the existing path', () => {
        assertIdConflict(false, addition(existingPath))
      })

      describe('to a path identical to the existing one (identity conflict)', () => {
        assertIdConflict(true, addition(pathIdenticalTo(existingPath)))
      })

      describe('to a completely different path (no conflict)', () => {
        assertIdConflict(false, addition(pathDifferentFrom(existingPath)))
      })
    })

    describe('when change is a move', () => {
      const move = ({ srcPath, dstPath }) => ({
        doc: builders.metadata().path(dstPath).build(),
        was: builders.metadata().path(srcPath).build()
      })

      describe('to a completely different path (should not happen)', () => {
        const dstPath = `dst-${pathDifferentFrom(existingPath)}`

        describe('from another completely different path', () => {
          assertIdConflict(
            false,
            move({
              dstPath,
              srcPath: `src-${pathDifferentFrom(existingPath, dstPath)}`
            })
          )
        })

        describe('from a path identical to the existing one', () => {
          assertIdConflict(
            false,
            move({ dstPath, srcPath: pathIdenticalTo(existingPath) })
          )
        })

        describe('from a path identical to the destination', () => {
          assertIdConflict(
            false,
            move({ dstPath, srcPath: pathIdenticalTo(dstPath) })
          )
        })

        describe('from the existing path', () => {
          assertIdConflict(false, move({ dstPath, srcPath: existingPath }))
        })
      })

      describe('to the existing path (not an identity conflict)', () => {
        const dstPath = existingPath

        describe('from another completely different path', () => {
          assertIdConflict(
            false,
            move({
              dstPath,
              srcPath: `src-${pathDifferentFrom(existingPath, dstPath)}`
            })
          )
        })

        describe('from a path identical to the existing one and the destination', () => {
          assertIdConflict(
            false,
            move({ dstPath, srcPath: pathIdenticalTo(existingPath) })
          )
        })

        describe('from the existing path (should not happen)', () => {
          assertIdConflict(false, move({ dstPath, srcPath: existingPath }))
        })
      })

      describe('to a path identical to the existing one', () => {
        const dstPath = pathIdenticalTo(existingPath)

        describe('from another completely different path (id conflict)', () => {
          assertIdConflict(
            true,
            move({
              dstPath,
              srcPath: `src-${pathDifferentFrom(existingPath, dstPath)}`
            })
          )
        })

        describe('from a path identical to the existing one & the destination (almost impossible)', () => {
          assertIdConflict(
            true,
            move({ dstPath, srcPath: pathIdenticalTo(existingPath, 2) })
          )
        })

        describe('from the existing path (identical renaming)', () => {
          assertIdConflict(false, move({ dstPath, srcPath: existingPath }))
        })
      })
    })
  })

  describe('.existsBetween()', () => {
    const idCannotBeDifferentForTheSamePath = () => {
      it.skip('impossible: id cannot be different for the same path')
    }

    context('with same #_id, same #path, same #remote._id', () => {
      it('detects nothing (either up-to-date or unsynced successive local changes)', () => {
        const doc = builders
          .metadata()
          .remoteId('1')
          .sides({ remote: 1 })
          .build()
        should(IdConflict.existsBetween({ doc }, doc)).be.false()

        delete doc.remote
        should(IdConflict.existsBetween({ doc }, doc)).be.false()
      })
    })

    context(
      'with different #_id, same #path, same #remote._id',
      idCannotBeDifferentForTheSamePath
    )

    context('with same #_id, different #path, same #remote._id', () => {
      it('detects nothing (case-or-encoding-only renaming)', () => {
        const doc1 = builders
          .metadata()
          .path('foo')
          .remoteId('1')
          .upToDate()
          .build()
        const doc2 = builders
          .metadata(doc1)
          .path('FOO')
          .changedSide('local')
          .build()
        should(IdConflict.existsBetween({ doc: doc1 }, doc2)).be.false()
        should(IdConflict.existsBetween({ doc: doc2 }, doc1)).be.false()

        delete doc1.remote
        delete doc2.remote
        should(IdConflict.existsBetween({ doc: doc1 }, doc2)).be.false()
        should(IdConflict.existsBetween({ doc: doc2 }, doc1)).be.false()
      })
    })

    context('with same #_id, same #path, different #remote._id', () => {
      it('detects nothing (replacement)', () => {
        const doc1 = builders
          .metadata()
          .path('foo')
          .remoteId('1')
          .upToDate()
          .build()
        const doc2 = builders
          .metadata()
          .path('foo')
          .remoteId('2')
          .sides({ remote: 1 })
          .build()
        should(IdConflict.existsBetween({ doc: doc1 }, doc2)).be.false()
        should(IdConflict.existsBetween({ doc: doc2 }, doc1)).be.false()

        delete doc2.remote
        should(IdConflict.existsBetween({ doc: doc1 }, doc2)).be.false()
        should(IdConflict.existsBetween({ doc: doc2 }, doc1)).be.false()
      })
    })

    context('with different #_id, different #path, same #remote._id', () => {
      it('detects nothing (move)', () => {
        const doc1 = builders
          .metadata()
          .path('foo')
          .remoteId('1')
          .upToDate()
          .build()
        const doc2 = builders
          .metadata(doc1)
          .path('bar')
          .changedSide('remote')
          .build()
        should(IdConflict.existsBetween({ doc: doc1 }, doc2)).be.false()
        should(IdConflict.existsBetween({ doc: doc2 }, doc1)).be.false()

        delete doc1.remote
        delete doc2.remote
        should(IdConflict.existsBetween({ doc: doc1 }, doc2)).be.false()
        should(IdConflict.existsBetween({ doc: doc2 }, doc1)).be.false()
      })
    })

    context(
      'with different #_id, same #path, different #remote._id',
      idCannotBeDifferentForTheSamePath
    )

    context('with same #_id, different #path, different #remote._id', () => {
      let doc1, doc2

      beforeEach(() => {
        doc1 = builders
          .metadata()
          .path('alfred')
          .remoteId('1')
          .upToDate()
          .build()
        doc2 = builders
          .metadata()
          .path('Alfred')
          .remoteId('2')
          .sides({ remote: 1 })
          .build()
      })

      onPlatforms(['win32', 'darwin'], () => {
        it('detects an identity conflict (cannot coexist locally)', () => {
          should(IdConflict.existsBetween({ doc: doc1 }, doc2)).be.true()
          should(IdConflict.existsBetween({ doc: doc2 }, doc1)).be.true()

          delete doc1.remote
          should(IdConflict.existsBetween({ doc: doc1 }, doc2)).be.true()
          should(IdConflict.existsBetween({ doc: doc2 }, doc1)).be.true()
        })
      })

      onPlatform('linux', () => {
        it('detects nothing (can coexist locally)', () => {
          should(IdConflict.existsBetween({ doc: doc1 }, doc2)).be.false()
          should(IdConflict.existsBetween({ doc: doc2 }, doc1)).be.false()

          delete doc1.remote
          should(IdConflict.existsBetween({ doc: doc1 }, doc2)).be.false()
          should(IdConflict.existsBetween({ doc: doc2 }, doc1)).be.false()
        })
      })
    })

    context(
      'with different #_id, different #path, different #remote._id',
      () => {
        it('detects nothing (totally unrelated)', () => {
          const doc1 = builders
            .metadata()
            .path('foo')
            .remoteId('1')
            .upToDate()
            .build()
          const doc2 = builders
            .metadata()
            .path('bar')
            .remoteId('2')
            .sides({ remote: 1 })
            .build()
          should(IdConflict.existsBetween({ doc: doc1 }, doc2)).be.false()
          should(IdConflict.existsBetween({ doc: doc2 }, doc1)).be.false()

          delete doc1.remote
          should(IdConflict.existsBetween({ doc: doc1 }, doc2)).be.false()
          should(IdConflict.existsBetween({ doc: doc2 }, doc1)).be.false()
        })
      }
    )
  })
})

/* eslint-env mocha */

const should = require('should')

const MetadataBuilders = require('../support/builders/metadata')
const {
  onPlatform,
  onPlatforms
} = require('../support/helpers/platform')

const IdConflict = require('../../core/IdConflict')

const { platform } = process

describe('IdConflict', function () {
  let builders

  beforeEach(() => {
    builders = new MetadataBuilders()
  })

  describe('.detect()', () => {
    const sideName = 'remote' // whatever

    onPlatforms(['win32', 'darwin'], () => {
      it('returns an IdConflict object when a conflict exists between a new doc and an existing one', () => {
        const existingDoc = builders.whatever().path('alfred').remoteId('1').build()
        const newDoc = builders.whatever().path('Alfred').remoteId('2').build()
        should(IdConflict.detect(sideName, newDoc, existingDoc)).deepEqual({
          existingDoc,
          newDoc,
          platform,
          sideName
        })
      })
    })

    onPlatform('linux', () => {
      it('returns nothing when a conflict would exist on other platforms', () => {
        const existingDoc = builders.whatever().path('alfred').remoteId('1').build()
        const newDoc = builders.whatever().path('Alfred').remoteId('2').build()
        should(IdConflict.detect(sideName, newDoc, existingDoc)).be.undefined()
      })
    })

    it('returns nothing when no conflict exists between a new doc and an existing one', () => {
      const existingDoc = builders.whatever().path('alfred').remoteId('1').build()
      const newDoc = builders.whatever().path('alfred2').remoteId('2').build()
      should(IdConflict.detect(sideName, newDoc, existingDoc)).be.undefined()
    })

    it('returns nothing when there is no existing doc', () => {
      const newDoc = builders.whatever().path('Alfred').remoteId('2').build()
      should(IdConflict.detect(sideName, newDoc)).be.undefined()
    })
  })

  describe('.existsBetween()', () => {
    const idCannotBeDifferentForTheSamePath = () => {
      it.skip('impossible: id cannot be different for the same path')
    }

    context('with same #_id, same #path, same #remote._id', () => {
      it('detects nothing (either up-to-date or unsynced successive local changes)', () => {
        const doc = builders.whatever().remoteId('1').build()
        should(IdConflict.existsBetween(doc, doc)).be.false()

        delete doc.remote
        should(IdConflict.existsBetween(doc, doc)).be.false()
      })
    })

    context('with different #_id, same #path, same #remote._id',
      idCannotBeDifferentForTheSamePath)

    context('with same #_id, different #path, same #remote._id', () => {
      it('detects nothing (case-or-encoding-only renaming)', () => {
        const doc1 = builders.whatever().path('foo').remoteId('1').build()
        const doc2 = builders.whatever().path('FOO').remoteId('1').build()
        should(IdConflict.existsBetween(doc1, doc2)).be.false()
        should(IdConflict.existsBetween(doc2, doc1)).be.false()

        delete doc1.remote
        delete doc2.remote
        should(IdConflict.existsBetween(doc1, doc2)).be.false()
        should(IdConflict.existsBetween(doc2, doc1)).be.false()
      })
    })

    context('with same #_id, same #path, different #remote._id', () => {
      it('detects nothing (replacement)', () => {
        const doc1 = builders.whatever().path('foo').remoteId('1').build()
        const doc2 = builders.whatever().path('foo').remoteId('2').build()
        should(IdConflict.existsBetween(doc1, doc2)).be.false()
        should(IdConflict.existsBetween(doc2, doc1)).be.false()

        delete doc2.remote
        should(IdConflict.existsBetween(doc1, doc2)).be.false()
        should(IdConflict.existsBetween(doc2, doc1)).be.false()
      })
    })

    context('with different #_id, different #path, same #remote._id', () => {
      it('detects nothing (move)', () => {
        const doc1 = builders.whatever().path('foo').remoteId('1').build()
        const doc2 = builders.whatever().path('bar').remoteId('1').build()
        should(IdConflict.existsBetween(doc1, doc2)).be.false()
        should(IdConflict.existsBetween(doc2, doc1)).be.false()

        delete doc1.remote
        delete doc2.remote
        should(IdConflict.existsBetween(doc1, doc2)).be.false()
        should(IdConflict.existsBetween(doc2, doc1)).be.false()
      })
    })

    context('with different #_id, same #path, different #remote._id',
      idCannotBeDifferentForTheSamePath)

    context('with same #_id, different #path, different #remote._id', () => {
      let doc1, doc2

      beforeEach(() => {
        doc1 = builders.whatever().path('alfred').remoteId('1').build()
        doc2 = builders.whatever().path('Alfred').remoteId('2').build()
      })

      onPlatforms(['win32', 'darwin'], () => {
        it('detects an identity conflict (cannot coexist locally)', () => {
          should(IdConflict.existsBetween(doc1, doc2)).be.true()
          should(IdConflict.existsBetween(doc2, doc1)).be.true()

          delete doc1.remote
          should(IdConflict.existsBetween(doc1, doc2)).be.true()
          should(IdConflict.existsBetween(doc2, doc1)).be.true()
        })
      })

      onPlatform('linux', () => {
        it('detects nothing (can coexist locally)', () => {
          should(IdConflict.existsBetween(doc1, doc2)).be.false()
          should(IdConflict.existsBetween(doc2, doc1)).be.false()

          delete doc1.remote
          should(IdConflict.existsBetween(doc1, doc2)).be.false()
          should(IdConflict.existsBetween(doc2, doc1)).be.false()
        })
      })
    })

    context('with different #_id, different #path, different #remote._id', () => {
      it('detects nothing (totally unrelated)', () => {
        const doc1 = builders.whatever().path('foo').remoteId('1').build()
        const doc2 = builders.whatever().path('bar').remoteId('2').build()
        should(IdConflict.existsBetween(doc1, doc2)).be.false()
        should(IdConflict.existsBetween(doc2, doc1)).be.false()

        delete doc1.remote
        should(IdConflict.existsBetween(doc1, doc2)).be.false()
        should(IdConflict.existsBetween(doc2, doc1)).be.false()
      })
    })
  })
})

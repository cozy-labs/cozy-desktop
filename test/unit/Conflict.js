/* @flow */
/* eslint-env mocha */

const should = require('should')

const MetadataBuilders = require('../support/builders/metadata')
const {
  onPlatform,
  onPlatforms
} = require('../support/helpers/platform')

const Conflict = require('../../core/Conflict')

const { platform } = process

describe('Conflict', function () {
  let builders

  beforeEach(() => {
    builders = new MetadataBuilders()
  })

  describe('.detectOnIdentity()', () => {
    const sideName = 'remote' // whatever

    const idCannotBeDifferentForTheSamePath = () => {
      it.skip('impossible: id cannot be different for the same path')
    }

    it('returns nothing when there is no existing doc', () => {
      const newDoc = builders.whatever().path('Alfred').remoteId('2').build()
      should(Conflict.detectOnIdentity(sideName, newDoc)).be.undefined()
    })

    context('with same #_id, same #path, same #remote._id', () => {
      it('detects nothing (either up-to-date or unsynced successive local changes)', () => {
        const doc = builders.whatever().remoteId('1').build()
        should(Conflict.detectOnIdentity(sideName, doc, doc)).be.undefined()

        delete doc.remote
        should(Conflict.detectOnIdentity(sideName, doc, doc)).be.undefined()
      })
    })

    context('with different #_id, same #path, same #remote._id',
      idCannotBeDifferentForTheSamePath)

    context('with same #_id, different #path, same #remote._id', () => {
      it('detects nothing (case-or-encoding-only renaming)', () => {
        const doc1 = builders.whatever().path('foo').remoteId('1').build()
        const doc2 = builders.whatever().path('FOO').remoteId('1').build()
        should(Conflict.detectOnIdentity(sideName, doc1, doc2)).be.undefined()
        should(Conflict.detectOnIdentity(sideName, doc2, doc1)).be.undefined()

        delete doc1.remote
        delete doc2.remote
        should(Conflict.detectOnIdentity(sideName, doc1, doc2)).be.undefined()
        should(Conflict.detectOnIdentity(sideName, doc2, doc1)).be.undefined()
      })
    })

    context('with same #_id, same #path, different #remote._id', () => {
      it('detects nothing (replacement)', () => {
        const doc1 = builders.whatever().path('foo').remoteId('1').build()
        const doc2 = builders.whatever().path('foo').remoteId('2').build()
        should(Conflict.detectOnIdentity(sideName, doc1, doc2)).be.undefined()
        should(Conflict.detectOnIdentity(sideName, doc2, doc1)).be.undefined()

        delete doc2.remote
        should(Conflict.detectOnIdentity(sideName, doc1, doc2)).be.undefined()
        should(Conflict.detectOnIdentity(sideName, doc2, doc1)).be.undefined()
      })
    })

    context('with different #_id, different #path, same #remote._id', () => {
      it('detects nothing (move)', () => {
        const doc1 = builders.whatever().path('foo').remoteId('1').build()
        const doc2 = builders.whatever().path('bar').remoteId('1').build()
        should(Conflict.detectOnIdentity(sideName, doc1, doc2)).be.undefined()
        should(Conflict.detectOnIdentity(sideName, doc2, doc1)).be.undefined()

        delete doc1.remote
        delete doc2.remote
        should(Conflict.detectOnIdentity(sideName, doc1, doc2)).be.undefined()
        should(Conflict.detectOnIdentity(sideName, doc2, doc1)).be.undefined()
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

      onPlatforms('win32', 'darwin', () => {
        it('detects an identity conflict (cannot coexist locally)', () => {
          should(Conflict.detectOnIdentity(sideName, doc1, doc2)).deepEqual({
            existingDoc: doc2,
            newDoc: doc1,
            platform,
            sideName
          })
          should(Conflict.detectOnIdentity(sideName, doc2, doc1)).deepEqual({
            existingDoc: doc1,
            newDoc: doc2,
            platform,
            sideName
          })

          delete doc1.remote
          should(Conflict.detectOnIdentity(sideName, doc1, doc2)).deepEqual({
            existingDoc: doc2,
            newDoc: doc1,
            platform,
            sideName
          })
          should(Conflict.detectOnIdentity(sideName, doc2, doc1)).deepEqual({
            existingDoc: doc1,
            newDoc: doc2,
            platform,
            sideName
          })
        })
      })

      onPlatform('linux', () => {
        it('detects nothing (can coexist locally)', () => {
          should(Conflict.detectOnIdentity(sideName, doc1, doc2)).be.undefined()
          should(Conflict.detectOnIdentity(sideName, doc2, doc1)).be.undefined()

          delete doc1.remote
          should(Conflict.detectOnIdentity(sideName, doc1, doc2)).be.undefined()
          should(Conflict.detectOnIdentity(sideName, doc2, doc1)).be.undefined()
        })
      })
    })

    context('with different #_id, different #path, different #remote._id', () => {
      it('detects nothing (totally unrelated)', () => {
        const doc1 = builders.whatever().path('foo').remoteId('1').build()
        const doc2 = builders.whatever().path('bar').remoteId('2').build()
        should(Conflict.detectOnIdentity(sideName, doc1, doc2)).be.undefined()
        should(Conflict.detectOnIdentity(sideName, doc2, doc1)).be.undefined()

        delete doc1.remote
        should(Conflict.detectOnIdentity(sideName, doc1, doc2)).be.undefined()
        should(Conflict.detectOnIdentity(sideName, doc2, doc1)).be.undefined()
      })
    })
  })
})

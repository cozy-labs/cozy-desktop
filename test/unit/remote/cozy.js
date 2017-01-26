/* eslint-env mocha */

import RemoteCozy from '../../../src/remote/cozy'
import { ROOT_DIR_ID, TRASH_DIR_ID } from '../../../src/remote/constants'

import { COZY_URL, builders } from '../../helpers/integration'

describe('RemoteCozy', function () {
  describe('changes', function () {
    context('when cozy works', function () {
      let remoteCozy

      beforeEach(function () {
        remoteCozy = new RemoteCozy(COZY_URL)
      })

      context('without an update sequence', function () {
        it('lists all changes since the database creation', async function () {
          let changes = await remoteCozy.changes()
          let ids = changes.results.map(result => result.id)

          ids.should.containEql(ROOT_DIR_ID)
          ids.should.containEql(TRASH_DIR_ID)
        })
      })

      context('with an update sequence', function () {
        it('lists only changes that occured since then', async function () {
          let oldChanges = await remoteCozy.changes()
          let seq = oldChanges.last_seq

          let dir = await builders.dir(remoteCozy).build()
          let file = await builders.file(remoteCozy).inDir(dir).build()

          let newChanges = await remoteCozy.changes(seq)
          let ids = newChanges.results.map(result => result.id).sort()

          ids.should.eql([file._id, dir._id].sort())
        })
      })
    })
  })
})

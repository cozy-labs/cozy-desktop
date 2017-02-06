/* eslint-env mocha */

import { FetchError } from 'node-fetch'

import RemoteCozy from '../../../src/remote/cozy'
import { ROOT_DIR_ID, TRASH_DIR_ID } from '../../../src/remote/constants'

import { COZY_URL, builders } from '../../helpers/integration'
import CozyStackDouble from '../../doubles/cozy_stack'

const cozyStackDouble = new CozyStackDouble()

describe('RemoteCozy', function () {
  before(() => cozyStackDouble.start())
  after(() => cozyStackDouble.stop())
  afterEach(() => cozyStackDouble.clearStub())

  describe('changes', function () {
    it('rejects when Cozy is unreachable', function () {
      const url = 'http://unreachable.cozy.test'
      const remoteCozy = new RemoteCozy(url)

      return remoteCozy.changes().should.be.rejectedWith(FetchError)
    })

    it('rejects when cozy sends invalid JSON', function () {
      const remoteCozy = new RemoteCozy(cozyStackDouble.url())

      cozyStackDouble.stub((req, res) => {
        res.writeHead(404, {'Content-Type': 'text/plain'})
        res.end('Not Found')
      })

      return remoteCozy.changes().should.be.rejectedWith(SyntaxError)
    })

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

          let dir = await builders.dir().build()
          let file = await builders.file().inDir(dir).build()

          let newChanges = await remoteCozy.changes(seq)
          let ids = newChanges.results.map(result => result.id).sort()

          ids.should.eql([file._id, dir._id].sort())
        })
      })
    })
  })
})

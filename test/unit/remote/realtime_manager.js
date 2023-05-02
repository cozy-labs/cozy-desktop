/* @flow */
/* eslint-env mocha */

const sinon = require('sinon')
const should = require('should')
const { FetchError } = require('cozy-stack-client')

const configHelpers = require('../../support/helpers/config')
const cozyHelpers = require('../../support/helpers/cozy')
const pouchHelpers = require('../../support/helpers/pouch')

const { FILES_DOCTYPE } = require('../../../core/remote/constants')
const { RemoteCozy } = require('../../../core/remote/cozy')
const { COZY_NOT_FOUND_CODE } = require('../../../core/remote/errors')
const {
  RealtimeManager
} = require('../../../core/remote/watcher/realtime_manager')

const setup = async ({ config }) => {
  const remoteCozy = new RemoteCozy(config)
  remoteCozy.client = cozyHelpers.cozy

  const realtime = await remoteCozy.realtime()

  const eventHandler = sinon.stub()

  const realtimeManager = new RealtimeManager(remoteCozy, eventHandler)

  return {
    eventHandler,
    realtime,
    realtimeManager,
    remoteCozy
  }
}

const networkError = ({ status }, message) => {
  return new FetchError({ status }, message)
}

describe('RealtimeManager', function () {
  before('instanciate config', configHelpers.createConfig)
  before('register OAuth client', configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)

  describe('start', () => {
    it('subscribes to all io.cozy.files realtime events', async function () {
      const { realtime, realtimeManager } = await setup(this)

      const subscribeSpy = sinon.spy(realtime, 'subscribe')

      try {
        await realtimeManager.start()

        should(subscribeSpy).have.been.calledWith(
          'created',
          FILES_DOCTYPE,
          realtimeManager.onCreated
        )
        should(subscribeSpy).have.been.calledWith(
          'updated',
          FILES_DOCTYPE,
          realtimeManager.onUpdated
        )
        should(subscribeSpy).have.been.calledWith(
          'deleted',
          FILES_DOCTYPE,
          realtimeManager.onDeleted
        )
      } finally {
        subscribeSpy.restore()
      }
    })

    context('on network error', () => {
      it('schedules a reconnection', async function () {
        const { realtime, realtimeManager } = await setup(this)

        const err = networkError({}, 'net::blah')
        const subscribeStub = sinon.stub(realtime, 'subscribe').throws(err)

        try {
          should(realtimeManager.reconnectTimeout).be.null()

          await should(realtimeManager.start()).be.fulfilled()

          should(realtimeManager.reconnectTimeout).not.be.null()
          clearTimeout(realtimeManager.reconnectTimeout)
        } finally {
          subscribeStub.restore()
        }
      })
    })

    context('on non-network error', () => {
      it('throws and does not schedule any reconnection', async function () {
        const { realtime, realtimeManager } = await setup(this)

        const err = networkError({ status: 404 }, { error: [] })
        const subscribeStub = sinon.stub(realtime, 'subscribe').throws(err)

        try {
          should(realtimeManager.reconnectTimeout).be.null()

          await should(realtimeManager.start()).be.rejectedWith({
            code: COZY_NOT_FOUND_CODE
          })

          should(realtimeManager.reconnectTimeout).be.null()
        } finally {
          subscribeStub.restore()
        }
      })
    })
  })

  describe('stop', () => {
    it('removes all subscriptions', async function () {
      const { realtime, realtimeManager } = await setup(this)

      const unsubscribeSpy = sinon.spy(realtime, 'unsubscribe')

      try {
        await realtimeManager.stop()

        should(unsubscribeSpy).have.been.calledWith(
          'created',
          FILES_DOCTYPE,
          realtimeManager.onCreated
        )
        should(unsubscribeSpy).have.been.calledWith(
          'updated',
          FILES_DOCTYPE,
          realtimeManager.onUpdated
        )
        should(unsubscribeSpy).have.been.calledWith(
          'deleted',
          FILES_DOCTYPE,
          realtimeManager.onDeleted
        )
      } finally {
        unsubscribeSpy.restore()
      }
    })
  })

  describe('onCreated', () => {
    it('calls event handler for a created realtime event', async function () {
      const { eventHandler, realtimeManager } = await setup(this)

      // $FlowFixMe we don't care about the type of doc passed here
      realtimeManager.onCreated({})

      should(eventHandler).have.been.calledOnce()
    })
  })

  describe('onUpdated', () => {
    it('calls event handler for an updated realtime event', async function () {
      const { eventHandler, realtimeManager } = await setup(this)

      // $FlowFixMe we don't care about the type of doc passed here
      realtimeManager.onUpdated({})

      should(eventHandler).have.been.calledOnce()
    })
  })

  describe('onDeleted', () => {
    it('calls event handler for a deleted realtime event', async function () {
      const { eventHandler, realtimeManager } = await setup(this)

      // $FlowFixMe we don't care about the type of doc passed here
      realtimeManager.onDeleted({})

      should(eventHandler).have.been.calledOnce()
    })
  })
})

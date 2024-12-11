/* @flow */
/* eslint-env mocha */

const should = require('should')
const sinon = require('sinon')

const { FILES_DOCTYPE } = require('../../../core/remote/constants')
const {
  RealtimeManager
} = require('../../../core/remote/watcher/realtime_manager')
const configHelpers = require('../../support/helpers/config')
const cozyHelpers = require('../../support/helpers/cozy')
const pouchHelpers = require('../../support/helpers/pouch')

const setup = async () => {
  const client = await cozyHelpers.newClient()
  const eventHandler = sinon.stub()
  const realtimeManager = new RealtimeManager()
  realtimeManager.setup({ client, eventHandler })

  return {
    eventHandler,
    realtime: realtimeManager.realtime,
    realtimeManager,
    teardown: client.logout
  }
}

describe('RealtimeManager', function() {
  before('instanciate config', configHelpers.createConfig)
  before('register OAuth client', configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)

  describe('start', () => {
    it('subscribes to all io.cozy.files realtime events', async function() {
      const { teardown, realtime, realtimeManager } = await setup()

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
        await teardown()
      }
    })
  })

  describe('stop', () => {
    it('removes all subscriptions', async function() {
      const { teardown, realtime, realtimeManager } = await setup()

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
        await teardown()
      }
    })
  })

  describe('onCreated', () => {
    it('calls event handler for a created realtime event', async function() {
      const { teardown, eventHandler, realtimeManager } = await setup()

      try {
        // $FlowFixMe we don't care about the type of doc passed here
        realtimeManager.onCreated({})

        should(eventHandler).have.been.calledOnce()
      } finally {
        await teardown()
      }
    })
  })

  describe('onUpdated', () => {
    it('calls event handler for an updated realtime event', async function() {
      const { teardown, eventHandler, realtimeManager } = await setup()

      try {
        // $FlowFixMe we don't care about the type of doc passed here
        realtimeManager.onUpdated({})

        should(eventHandler).have.been.calledOnce()
      } finally {
        await teardown()
      }
    })
  })

  describe('onDeleted', () => {
    it('calls event handler for a deleted realtime event', async function() {
      const { teardown, eventHandler, realtimeManager } = await setup()

      try {
        // $FlowFixMe we don't care about the type of doc passed here
        realtimeManager.onDeleted({})

        should(eventHandler).have.been.calledOnce()
      } finally {
        await teardown()
      }
    })
  })
})

/* @flow */

const Sentry = require('raven')
const bunyan = require('bunyan')
const url = require('url')

const logger = require('./logger')
const log = logger({
  component: 'Sentry'
})

const _ = require('lodash')

module.exports = {
  setup,
  flag,
  toSentryContext
}

const SENTRY_REF = `ed6d0a175d504ead84851717b9bdb72e:324375dbe2ae4bbf8c212ae4eaf26289`
const SENTRY_DSN = `https://${SENTRY_REF}@sentry.cozycloud.cc/91`
const DOMAIN_TO_ENV = {
  'cozy.tools': 'development',
  'cozy.works': 'development',
  'cozy.rocks': 'production',
  'mycozy.cloud': 'production'
}

function toSentryContext (cozyUrl/*: string */) {
  const host = cozyUrl && url.parse(cozyUrl).host
  if (!host) throw new Error('badly formated URL')
  const urlParts = host.split(':')[0].split('.')
  const domain = urlParts.slice(-2).join('.')
  const instance = urlParts.slice(-3).join('.')
  const environment = DOMAIN_TO_ENV[domain] || 'selfhost'
  return { domain, instance, environment }
}

const bunyanErrObjectToError = (data) => {
  if (data instanceof Error) return data
  // TODO: make Flow happy with extended error type
  const error /*: Object */ = new Error(data.message)
  error.name = data.name
  error.stack = data.stack
  error.code = data.code
  return error
}

let isSentryConfigured = false

/*::
type ClientInfo = {
  appVersion: string,
  cozyUrl: string
}
*/

function setup (clientInfos /*: ClientInfo */) {
  try {
    const { appVersion, cozyUrl } = clientInfos
    const { domain, instance, environment } = toSentryContext(cozyUrl)
    Sentry.config(SENTRY_DSN, {
      release: appVersion,
      environment,
      tags: { domain, instance }
    }).install((err, sendErr, eventId) => {
      // fatal error handler
      if (sendErr) log.error({err, sendErr}, 'Fatal error, unable to send to sentry')
      else log.error({err, eventId}, 'Fatal error, sent to sentry')
      process.exit(1) // eslint-disable-line no-process-exit
    })
    isSentryConfigured = true
    log.info('Sentry configured !')
  } catch (err) {
    console.log('FAIL TO SETUP', err)
    log.error({err}, 'Could not load Sentry, errors will not be sent to Sentry')
  }
}

const handleBunyanMessage = (msg) => {
  const level = msg.level >= bunyan.ERROR ? 'error'
                : msg.level >= bunyan.WARNING ? 'warning'
                : 'info'

  if (!isSentryConfigured) return

  // for now only logs marked explicitly for sentry get sent
  if (msg.sentry || (msg.err && msg.err.sentry)) {
    if (msg.err) {
      const extra = _.omit(msg, ['err', 'tags', 'v', 'hostname', 'sentry', 'pid', 'level'])
      Sentry.captureException(bunyanErrObjectToError(msg.err), { extra, level })
    } else {
      const extra = _.omit(msg, ['err', 'tags', 'v', 'hostname', 'sentry', 'pid', 'level'])
      Sentry.captureMessage(msg.msg, { extra, level })
    }
  } else { // keep it as breadcrumb
    Sentry.captureBreadcrumb({
      message: msg.msg,
      category: msg.component,
      data: _.omit(msg, ['component', 'pid', 'name', 'hostname', 'level', 'v', 'msg']),
      level
    })
  }
}

// TODO: make Flow happy with extended error type
function flag (err/*: Object */) {
  err.sentry = true
  return err
}
if (!process.env.DEBUG && !process.env.TESTDEBUG && !process.env.COZY_NO_SENTRY) {
  logger.defaultLogger.addStream({
    type: 'raw',
    stream: { write: (msg) => {
      try {
        handleBunyanMessage(msg)
      } catch (err) { console.log('Error in handleBunyanMessage', err) }
    }}
  })
}

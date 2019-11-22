/** Sentry monitoring support
 *
 * @module core/utils/sentry
 * @flow
 */

const Sentry = require('@sentry/electron')
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

const { COZY_NO_SENTRY, DEBUG, TESTDEBUG } = process.env

const SENTRY_REF = `ed6d0a175d504ead84851717b9bdb72e:324375dbe2ae4bbf8c212ae4eaf26289`
const SENTRY_DSN = `https://${SENTRY_REF}@sentry.cozycloud.cc/91`
const DOMAIN_TO_ENV = {
  'cozy.tools': 'development',
  'cozy.works': 'development',
  'cozy.rocks': 'production',
  'mycozy.cloud': 'production'
}

function toSentryContext(cozyUrl /*: string */) {
  const host = cozyUrl && new url.URL(cozyUrl).host
  if (!host) throw new Error('badly formated URL')
  const urlParts = host.split(':')[0].split('.')
  const domain = urlParts.slice(-2).join('.')
  const instance = urlParts.slice(-3).join('.')
  const environment = DOMAIN_TO_ENV[domain] || 'selfhost'
  return { domain, instance, environment }
}

const bunyanErrObjectToError = data => {
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
import type { ClientInfo } from '../app'
*/

function setup(clientInfos /*: ClientInfo */) {
  if (DEBUG || TESTDEBUG || COZY_NO_SENTRY || isSentryConfigured) return
  try {
    const { appVersion, cozyUrl } = clientInfos
    const { domain, instance, environment } = toSentryContext(cozyUrl)
    Sentry.init({
      dsn: SENTRY_DSN,
      release: appVersion,
      environment
    })
    Sentry.configureScope(scope => {
      scope.setUser({ username: instance })
      scope.setTag('domain', domain)
      scope.setTag('instance', instance)
      scope.setTag('server_name', clientInfos.deviceName)
    })
    logger.defaultLogger.addStream({
      type: 'raw',
      stream: {
        write: msg => {
          try {
            handleBunyanMessage(msg)
          } catch (err) {
            // eslint-disable-next-line no-console
            console.log('Error in handleBunyanMessage', err)
          }
        }
      }
    })
    isSentryConfigured = true
    log.info('Sentry configured !')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log('FAIL TO SETUP', err)
    log.error(
      { err },
      'Could not load Sentry, errors will not be sent to Sentry'
    )
  }
}

const handleBunyanMessage = msg => {
  const level =
    msg.level >= bunyan.FATAL
      ? 'fatal'
      : msg.level >= bunyan.ERROR
      ? 'error'
      : msg.level >= bunyan.WARNING
      ? 'warning'
      : 'info'

  if (!isSentryConfigured) return

  // Send messages explicitly marked for sentry and all errors
  if (msg.sentry || msg.err) {
    const extra = _.omit(msg, [
      'err',
      'tags',
      'v',
      'hostname',
      'sentry',
      'pid',
      'level'
    ])

    Sentry.withScope(scope => {
      scope.setLevel(level)
      for (const key in extra) {
        scope.setExtra(key, extra[key])
      }

      if (msg.err) {
        Sentry.captureException(bunyanErrObjectToError(msg.err))
      } else {
        Sentry.captureMessage(msg.msg)
      }
    })
  } else {
    // keep it as breadcrumb
    Sentry.addBreadcrumb({
      message: msg.msg,
      category: msg.component,
      data: _.omit(msg, [
        'component',
        'pid',
        'name',
        'hostname',
        'level',
        'v',
        'msg'
      ]),
      level
    })
  }
}

// TODO: make Flow happy with extended error type
function flag(err /*: Object */) {
  err.sentry = true
  return err
}

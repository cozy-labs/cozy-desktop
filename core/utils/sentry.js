/** Sentry monitoring support
 *
 * @module core/utils/sentry
 * @flow
 *
 * Setup our Sentry integration to send errors and crash reports to our Sentry
 * server.
 *
 * Follow these steps to upload Electron debug symbols after each version
 * upgrade:
 *
 * 1. `sentry-wizard --skip-connect -u <server url> --integration electron
 * 2. Follow the steps (auth tokens can be generated here: https://<server url>/settings/account/api/auth-tokens/)
 * 3. `node sentry-symbols.js`
 */

const { session } = require('electron')
const Sentry = require('@sentry/electron')
const {
  ExtraErrorData: ExtraErrorDataIntegration
} = require('@sentry/integrations')
const bunyan = require('bunyan')
const url = require('url')
const _ = require('lodash')

const { SESSION_PARTITION_NAME } = require('../../gui/js/proxy')
const logger = require('./logger')

const log = logger({
  component: 'Sentry'
})

module.exports = {
  setup,
  flag,
  format,
  toSentryContext
}

const { COZY_NO_SENTRY, DEBUG, TESTDEBUG } = process.env

const SENTRY_REF = `e937e35fcaa14c9a84ca5980ef8a852e`
const SENTRY_DSN = `https://${SENTRY_REF}@errors.cozycloud.cc/4`
const DOMAIN_TO_ENV = {
  'cozy.localhost': 'development',
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
      environment,
      // Inject preload script into all used sessions
      getSessions: () => [
        session.defaultSession,
        session.fromPartition(SESSION_PARTITION_NAME)
      ],
      // Adding the ElectronMinidump integration like this
      // ensures that it is the first integrations to be initialized.
      integrations: defaultIntegrations => {
        return [
          // Uploads minidumps via Crashpad/Breakpad built in uploader with
          // partial context when reporting native crash.
          new Sentry.Integrations.ElectronMinidump(),
          // Extract all non-native attributes up to <depth> from Error objects
          // and attach them to events as extra data.
          // If the error object has a .toJSON() method, it will be run to
          // extract the additional data.
          new ExtraErrorDataIntegration({ depth: 10 }),
          ...defaultIntegrations
        ]
      }
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

  // Send messages explicitly marked for sentry and all TypeError instances
  if (msg.sentry || (msg.err && msg.err.name === 'TypeError')) {
    const extra = _.omit(msg, [
      'tags',
      'v',
      'hostname',
      'sentry',
      'pid',
      'level'
    ])

    Sentry.withScope(scope => {
      scope.setLevel(level)
      scope.setContext('msgDetails', extra)

      if (msg.err) {
        Sentry.captureException(format(msg.err))
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

/**
 * Make sure the given error object has the required attributes for Sentry to
 * group events with the same error together via `exception` fingerprinting.
 *
 * @see https://docs.sentry.io/data-management/event-grouping/
 *
 * For more details on the available attributes:
 * - @see {@link https://github.com/cozy/cozy-client-js/blob/master/src/fetch.js|cozy-client-js}
 * - @see {@link https://github.com/bitinn/node-fetch/blob/master/ERROR-HANDLING.md|node-fetch}
 * - @see {@link https://github.com/arantes555/electron-fetch/blob/master/ERROR-HANDLING.md|electron-fetch}
 * - @see {@link https://nodejs.org/api/errors.html|Node.js}
 */
function format(err /*: Object */) {
  switch (err.name) {
    case 'FetchError':
      if (err.reason) return cozyErrObjectToError(bunyanErrObjectToError(err))
      else if (err.type)
        return fetchErrObjectToError(bunyanErrObjectToError(err))
      return bunyanErrObjectToError(err)
    case 'Error':
      if (err.code) return systemErrObjectToError(bunyanErrObjectToError(err))
      else return bunyanErrObjectToError(err)
    default:
      return bunyanErrObjectToError(err)
  }
}

function cozyErrObjectToError(err) {
  switch (typeof err.reason) {
    case 'string':
      err.message = err.reason
      break
    case 'object':
      err.message =
        err.reason.errors && err.reason.errors.length
          ? err.reason.errors[0].detail
          : err.reason.detail
      break
  }
  err.type = err.type || 'FetchError'

  return err
}

function fetchErrObjectToError(err) {
  switch (err.type) {
    case 'system':
    case 'proxy':
      err.message = err.code
      break
    default:
      err.message = err.type
  }
  err.type = 'FetchError'

  return err
}

function systemErrObjectToError(err) {
  err.type = 'Error'
  err.message = err.code

  return err
}

function bunyanErrObjectToError(data) {
  const error /*: Object */ = new Error(data.message)
  for (const attr in data) {
    error[attr] = data[attr]
  }
  if (!error.reason) error.reason = data.message

  return error
}

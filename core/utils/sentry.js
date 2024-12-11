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

const url = require('url')

const Sentry = require('@sentry/electron/main')
const {
  ExtraErrorData: ExtraErrorDataIntegration
} = require('@sentry/integrations')
const { session } = require('electron')
const _ = require('lodash')
const winston = require('winston')
const { combine, json } = winston.format

const {
  FATAL_LVL,
  ERROR_LVL,
  WARN_LVL,
  INFO_LVL,
  DEBUG_LVL,
  defaultFormatter,
  baseLogger,
  logger
} = require('./logger')
const { HOURS } = require('./time')
const { SESSION_PARTITION_NAME } = require('../../gui/js/network')

const log = logger({
  component: 'Sentry'
})

module.exports = {
  setup,
  flag,
  formatError,
  toSentryContext
}

const { CI, COZY_NO_SENTRY, DEBUG } = process.env

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

let ErrorsAlreadySent /* Map<string,Date> */

function setup(clientInfos /*: ClientInfo */) {
  if (CI || COZY_NO_SENTRY || isSentryConfigured) {
    log.info('skipping Sentry configuration', {
      COZY_NO_SENTRY,
      isSentryConfigured
    })
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log(
        { COZY_NO_SENTRY, isSentryConfigured },
        'skipping Sentry configuration'
      )
    }
    return
  }
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
          // Extract all non-native attributes up to <depth> from Error objects
          // and attach them to events as extra data.
          // If the error object has a .toJSON() method, it will be run to
          // extract the additional data.
          new ExtraErrorDataIntegration({ depth: 10 }),
          ...defaultIntegrations
        ]
      },
      beforeSend: (event, hint) => {
        const error = hint.originalException
        const message = error && error.message ? error.message : event.message

        const alreadySentThisDay =
          Number(ErrorsAlreadySent.get(message)) > Date.now() - 24 * HOURS

        // Update the last send date for this message
        ErrorsAlreadySent.set(message, Date.now())

        // Drop events if a similar message has already been sent if the past
        // 24 hours (i.e. avoid spamming our Sentry server).
        return alreadySentThisDay ? null : event
      },
      initialScope: scope => {
        scope.setUser({ username: instance })
        scope.setTag('domain', domain)
        scope.setTag('instance', instance)
        scope.setTag('server_name', clientInfos.deviceName)
        return scope
      }
    })
    baseLogger.add(
      new SentryTransport({
        format: combine(defaultFormatter, json())
      })
    )
    ErrorsAlreadySent = new Map()
    isSentryConfigured = true
    log.info('Sentry configured !')

    // Cleanup errors journal to prevent an ever growing Map
    setInterval(() => {
      for (const [msg, sentAt] of ErrorsAlreadySent.entries()) {
        if (sentAt < Date.now() - 24 * HOURS) {
          ErrorsAlreadySent.delete(msg)
        }
      }
    }, 1 * HOURS)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log('FAIL TO SETUP', err)
    log.error('Could not load Sentry, errors will not be sent to Sentry', {
      err
    })
  }
}

class SentryTransport extends winston.Transport {
  constructor(opts) {
    super(opts)
  }

  log(info, callback) {
    const { component, level, msg, sentry, time, ...meta } = info
    const { err } = meta
    const cleanMeta = _.omit(meta, ['tags', 'hostname'])
    const sentryLevel =
      level >= FATAL_LVL
        ? 'fatal'
        : level >= ERROR_LVL
        ? 'error'
        : level >= WARN_LVL
        ? 'warning'
        : level >= DEBUG_LVL
        ? 'debug'
        : level >= INFO_LVL
        ? 'log'
        : 'trace'

    // Send messages explicitly marked for sentry and all TypeError instances
    if (sentry || (err && err.name === 'TypeError')) {
      const extra = { component, msg, time, ...cleanMeta }

      Sentry.withScope(scope => {
        scope.setLevel(sentryLevel)
        scope.setContext('msgDetails', extra)

        if (err) {
          scope.setFingerprint([component, err.name, err.message])
          Sentry.captureException(formatError(err))
        } else {
          Sentry.captureMessage(msg)
        }
      })
    } else {
      // keep it as breadcrumb
      Sentry.addBreadcrumb({
        message: msg,
        category: component,
        data: { time, ...cleanMeta },
        level: sentryLevel
      })
    }

    callback()
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
function formatError(err /*: Object */) {
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

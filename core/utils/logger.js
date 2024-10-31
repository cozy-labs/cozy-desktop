/** A winston-based logger.
 *
 * @module core/utils/logger
 * @flow weak
 */

const fse = require('fs-extra')
const os = require('os')
const path = require('path')
const _ = require('lodash')
const winston = require('winston')
const DailyRotateFile = require('winston-daily-rotate-file')
const { combine, json, splat, timestamp, printf } = winston.format

/*::
export type Logger = winston.Logger
*/

const LOG_DIR = path.join(
  process.env.COZY_DESKTOP_DIR || os.homedir(),
  '.cozy-desktop'
)
const LOG_BASENAME = 'logs.txt'

fse.ensureDirSync(LOG_DIR)

// Remove the `timestamp` field as we use the `time` alias (for backwards
// compatibility with our jq filters.
//
// eslint-disable-next-line no-unused-vars
const dropTimestamp = winston.format(({ timestamp, ...meta }) => ({ ...meta }))

// Replace winston's string `level` with integers whose values come from
// bunyan for backwards compatibility with out jq filters.
// This has the added advantage of being sligtly lighter.
//
const FATAL_LVL = 60
const ERROR_LVL = 50
const WARN_LVL = 40
const INFO_LVL = 30
const DEBUG_LVL = 20
const TRACE_LVL = 10
const levelToInt = winston.format(({ level, ...meta }) => {
  const int =
    {
      fatal: FATAL_LVL,
      error: ERROR_LVL,
      warn: WARN_LVL,
      info: INFO_LVL,
      debug: DEBUG_LVL,
      trace: TRACE_LVL
    }[level] || 70
  return { level: int, ...meta }
})

// Replace `message` with `msg` for backwards compatibility with our jq filters.
const messageToMsg = winston.format(({ message, ...meta }) => ({
  msg: message,
  ...meta
}))

// Allow logging without message.
//
// e.g. log.info({ err, sentry: true })
//
const objectMsgToMeta = winston.format(({ message, ...meta }) => {
  if (typeof message === 'string') {
    return { message, ...meta }
  } else {
    return { message: '', ...message, ...meta }
  }
})

const hostname = winston.format(info => ({ ...info, hostname: os.hostname() }))

// Add the process pid to the logs so we can more easily detect when there are
// multiple instances of Desktop running at the same time or if it was
// restarted.
//
const pid = winston.format(info => ({ ...info, pid: process.pid }))

// Copied from bunyan for backwards compatibility.
//
const getFullErrorStack = err => {
  let ret = err.stack || err.toString()
  if (err.cause && typeof err.cause === 'function') {
    const cerr = err.cause()
    if (cerr) {
      ret += '\nCaused by: ' + getFullErrorStack(cerr)
    }
  }
  return ret
}
const errSerializer = err => {
  if (!err || !err.stack) return err
  const obj = {
    stack: getFullErrorStack(err),
    ..._.pick(err, [
      'message',
      'name',
      'code',
      'signal',
      'type',
      'reason',
      'address',
      'dest',
      'info',
      'path',
      'port',
      'syscall',
      'code',
      'status',
      'originalErr',
      'errors',
      'doc',
      'incompatibilities',
      'change',
      'data'
    ])
  }
  return obj
}
const error = winston.format(({ err, ...meta }) => ({
  err: errSerializer(err),
  ...meta
}))

const defaultFormatter = combine(
  objectMsgToMeta(),
  splat(),
  hostname(),
  pid(),
  timestamp({ alias: 'time' }),
  dropTimestamp(),
  error(),
  messageToMsg(),
  levelToInt()
)

const defaultTransport = new DailyRotateFile({
  dirname: LOG_DIR,
  filename: LOG_BASENAME,
  datePattern: 'YYYY-MM-DD', // XXX: rotate every day
  maxFiles: 7,
  zippedArchive: true, // XXX: gzip archived log files
  format: combine(defaultFormatter, json())
})

const baseLogger = winston.createLogger({
  levels: {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5
  },
  level: process.env.DEBUG ? 'trace' : 'info',
  transports: [defaultTransport]
})
baseLogger.on('error', err => {
  // eslint-disable-next-line no-console
  console.log('failed to log', { err })
})

if (process.env.DEBUG) {
  const filename = 'debug.log'
  // XXX: Clear log file from previous logs to simplify analysis
  fse.outputFileSync(filename, '')

  baseLogger.add(
    new winston.transports.File({
      filename,
      format: combine(defaultFormatter, json())
    })
  )
}

if (process.env.TESTDEBUG) {
  baseLogger.add(
    new winston.transports.Console({
      handleExceptions: true,
      format: combine(
        splat(),
        error(),
        printf(({ component, message, ...meta }) => {
          let out = component

          if (meta.path) out += ` ${meta.path}`
          if (meta._id) out += ` ${meta._id}`

          out += ` ${message}`

          const extra = _.omit(meta, ['level'])
          if (Object.keys(extra).length > 0) out += ` ${JSON.stringify(extra)}`

          return out
        })
      )
    })
  )
}

function logger(options) {
  return baseLogger.child(options)
}

module.exports = {
  FATAL_LVL,
  ERROR_LVL,
  WARN_LVL,
  INFO_LVL,
  DEBUG_LVL,
  TRACE_LVL,
  LOG_DIR,
  LOG_BASENAME,
  defaultFormatter,
  baseLogger,
  defaultTransport,
  dropTimestamp,
  logger,
  messageToMsg
}

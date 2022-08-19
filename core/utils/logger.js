/** A bunyan-based logger.
 *
 * @module core/utils/logger
 * @flow weak
 */

const bunyan = require('bunyan')
const fse = require('fs-extra')
const os = require('os')
const path = require('path')
const _ = require('lodash')

/*::
export type Logger = bunyan.Logger
*/

const LOG_DIR = path.join(
  process.env.COZY_DESKTOP_DIR || os.homedir(),
  '.cozy-desktop'
)
const LOG_FILENAME = 'logs.txt'
const LOG_FILE = path.join(LOG_DIR, LOG_FILENAME)

fse.ensureDirSync(LOG_DIR)

const defaultLogger = bunyan.createLogger({
  name: 'Cozy Desktop',
  level: 'trace',
  serializers: {
    err: errSerializer
  },
  streams: [
    {
      type: 'rotating-file',
      path: LOG_FILE,
      period: '1d',
      count: 7
    }
  ]
})

if (process.env.DEBUG) {
  const logPath = 'debug.log'
  if (fse.existsSync(logPath)) fse.outputFile(logPath, '')
  defaultLogger.addStream({ type: 'file', path: logPath, level: 'trace' })
}
if (process.env.TESTDEBUG) {
  defaultLogger.addStream({
    type: 'raw',
    level: process.env.TESTDEBUG,
    stream: {
      write: function (msg) {
        // eslint-disable-next-line no-console
        console.log(
          msg.component,
          msg.path || '',
          msg._id || '',
          msg.msg,
          _.omit(msg, [
            'component',
            'pid',
            'name',
            'hostname',
            'level',
            'time',
            'v',
            'msg'
          ])
        )
      }
    }
  })
}

function errSerializer(err) {
  const obj = _.defaults(
    bunyan.stdSerializers.err(err),
    _.pick(err, [
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
  )

  return obj
}

function logger(options) {
  return defaultLogger.child(options, true)
}

logger.defaultLogger = defaultLogger
logger.LOG_DIR = LOG_DIR
logger.LOG_FILENAME = LOG_FILENAME
logger.LOG_FILE = LOG_FILE
module.exports = logger

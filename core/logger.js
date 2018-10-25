/* @flow weak */

const bunyan = require('bunyan')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const _ = require('lodash')

const LOG_DIR = path.join(process.env.COZY_DESKTOP_DIR || os.homedir(), '.cozy-desktop')
const LOG_FILENAME = 'logs.txt'
const LOG_FILE = path.join(LOG_DIR, LOG_FILENAME)

fs.ensureDirSync(LOG_DIR)

const defaultLogger = bunyan.createLogger({
  name: 'Cozy Desktop',
  level: 'trace',
  serializers: {
    err: bunyan.stdSerializers.err
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
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath)
  defaultLogger.addStream({type: 'file', path: logPath, level: 'trace'})
}
if (process.env.TESTDEBUG) {
  defaultLogger.addStream({
    type: 'raw',
    level: process.env.TESTDEBUG,
    stream: {
      write: function (msg) {
        console.log(msg.component, msg.path || '', msg.msg, _.omit(msg, ['component', 'pid', 'name', 'hostname', 'level', 'time', 'v', 'msg']))
      }
    }
  })
}

function logger (options) {
  return defaultLogger.child(options, true)
}

logger.defaultLogger = defaultLogger
logger.LOG_DIR = LOG_DIR
logger.LOG_FILENAME = LOG_FILENAME
logger.LOG_FILE = LOG_FILE
module.exports = logger

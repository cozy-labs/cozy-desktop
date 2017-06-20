/* @flow weak */

import bunyan from 'bunyan'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'

export const LOG_DIR = path.join(process.env.COZY_DESKTOP_DIR || os.homedir(), '.cozy-desktop')
export const LOG_FILE = path.join(LOG_DIR, 'logs.txt')

fs.ensureDirSync(LOG_DIR)

export const defaultLogger = bunyan.createLogger({
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

function logger (options) {
  return defaultLogger.child(options)
}

export default logger

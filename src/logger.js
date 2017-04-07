/* @flow weak */

import bunyan from 'bunyan'
import os from 'os'
import path from 'path'

export const defaultLogger = bunyan.createLogger({
  name: 'Cozy Desktop',
  level: 'debug',
  serializers: {
    err: bunyan.stdSerializers.err
  },
  streams: [
    {
      type: 'rotating-file',
      path: path.join(process.env.COZY_DESKTOP_DIR || os.homedir(), '.cozy-desktop', 'logs.txt'),
      period: '1d',
      count: 7
    }
  ]
})

function logger (options) {
  return defaultLogger.child(options)
}

export default logger

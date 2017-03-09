/* @flow weak */

import prettyFormat from '@ava/pretty-format'
import {
  blue,
  dim,
  gray,
  green,
  magenta,
  red
} from 'chalk'
import * as diff from 'diff'

let printit = options => new Logger(options)
if (printit.console == null) { printit.console = global.console }

const theme = {
  boolean: 'dim',
  content: 'dim',
  date: 'dim',
  function: 'dim',
  label: 'dim',
  misc: 'dim',
  number: 'dim',
  prop: 'dim',
  value: 'dim',
  regex: 'dim',
  string: 'dim',
  tag: 'dim',

  key: 'italic',

  bracket: 'reset',
  comma: 'reset',
  symbol: 'reset',

  error: 'red'
}

function highlight (obj) {
  return prettyFormat(obj, {highlight: true, theme, min: true})
}

class Logger {
  options: Object

  constructor (options) {
    this.options = options
    if (this.options == null) { this.options = {} }
    if (this.options.date && (this.options.dateFormat == null)) {
      this.options.dateFormat = 'YYYY-MM-DD hh:mm:ss:S'
    }
  }

  colorify (text, color) {
    return `${color[0]}${text}${color[1]}`
  }

  stringify (text) {
    if (text instanceof Error && text.stack) {
      text = text.stack
    } else if (text instanceof Object) {
      text = JSON.stringify(text)
    }
    return text
  }

  getFileAndLine () {
    let stacklist = (new Error()).stack.split('\n').slice(4)
    let nodeReg = /at\s+(.*)\s+\((.*):(\d*):(\d*)\)/gi
    let browserReg = /at\s+()(.*):(\d*):(\d*)/gi

    let firstLineStack = stacklist[0]
    let fileAndLineInfos =
            nodeReg.exec(firstLineStack) || browserReg.exec(firstLineStack)

    let filePath = fileAndLineInfos[2].substr(process.cwd().length)
    let line = fileAndLineInfos[3]
    return `.${filePath}:${line} |`
  }

  format (level, texts) {
    var text = ((() => {
      let result = []
      for (text of Array.from(texts)) {
        if (typeof text === 'string') {
          result.push(this.stringify(text))
        } else if (text.stack) {
          result.push(text.stack)
        } else {
          result.push(highlight(text))
        }
      }
      return result
    })()).join(' ')

    if (level === 'success') { text = green(text) }
    if (level === 'error') { text = red(text) }
    if (level === 'debug') { text = dim(text) }

    let prefix = this.options.prefix
    if (prefix != null) {
      if (prefix.startsWith('Local')) prefix = magenta(prefix)
      if (prefix.startsWith('Remote')) prefix = blue(prefix)
      if (level === 'debug') prefix = dim(prefix)

      text = `${prefix} | ${text}`
    }

    if (this.options.date) {
      const date = new Date()
      let ms = date.getMilliseconds().toString()
      ms = '000'.substring(0, 3 - ms.length) + ms
      const timestamp = gray(`[${date.toLocaleString()} ${ms}]`)
      text = `${timestamp} ${text}`
    }
    return text
  }

  info (...texts) {
    if (process.env.DEBUG || (process.env.NODE_ENV !== 'test')) {
      return printit.console.info(this.format('info', texts))
    }
  }

  success (...texts) {
    if (process.env.DEBUG || (process.env.NODE_ENV !== 'test')) {
      return printit.console.info(this.format('success', texts))
    }
  }

  warn (...texts) {
    if (process.env.DEBUG || (process.env.NODE_ENV !== 'test')) {
      if (this.options.duplicateToStdout) {
        printit.console.info(this.format('warn', texts))
      }
      return printit.console.warn(this.format('warn', texts))
    }
  }

  error (...texts) {
    if (process.env.DEBUG || (process.env.NODE_ENV !== 'test')) {
      if (this.options.duplicateToStdout) {
        printit.console.info(this.format('error', texts))
      }
      return printit.console.error(this.format('error', texts))
    }
  }

  errorIfAny (err) {
    if (err) {
      this.error(err)
    }
  }

  debug (...texts) {
    if (process.env.DEBUG) {
      return printit.console.info(this.format('debug', texts))
    }
  }

  inspect (obj) {
    if (process.env.DEBUG) {
      this.raw(highlight(obj))
    }
  }

  diff (was, obj) {
    if (process.env.DEBUG) {
      const lines = diff.diffJson(was, obj)

      this.raw(lines.map(line => {
        if (line.added) {
          return green(line.value)
        } else if (line.removed) {
          return red(line.value)
        } else {
          return ''
        }
      }).join(''))
    }
  }

  raw (...texts) {
    if (process.env.DEBUG) {
      return printit.console.log(...texts)
    }
  }

  lineBreak (text) {
    return this.raw(Array(80).join('*'))
  }
}

export default printit

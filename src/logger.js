/* @flow weak */

import {
  red
} from 'chalk'

let printit = options => new Logger(options)
if (printit.console == null) { printit.console = global.console }

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
    if (process.env.DEBUG) { texts.unshift(this.getFileAndLine()) }

    var text = ((() => {
      let result = []
      for (text of Array.from(texts)) {
        result.push(this.stringify(text))
      }
      return result
    })()).join(' ')

    if (level === 'error') { text = red(text) }

    if (this.options.prefix != null) { text = `${this.options.prefix} | ${text}` }

    if (level) { text = `${level} - ${text}` }
    if (this.options.date) {
      const date = new Date()
      let ms = date.getMilliseconds().toString()
      ms = '000'.substring(0, 3 - ms.length) + ms
      text = `[${date.toLocaleString()} ${ms}] ${text}`
    }
    return text
  }

  info (...texts) {
    if (process.env.DEBUG || (process.env.NODE_ENV !== 'test')) {
      return printit.console.info(this.format('info', texts))
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

  debug (...texts) {
    if (process.env.DEBUG) {
      return printit.console.info(this.format('debug', texts))
    }
  }

  raw (...texts) {
    return printit.console.log(...texts)
  }

  lineBreak (text) {
    return this.raw(Array(80).join('*'))
  }
}

export default printit

/* @flow weak */

let printit = options => new Logger(options)
if (printit.console == null) { printit.console = global.console }

let colors = {
  blue: ['\x1B[34m', '\x1B[39m'],
  cyan: ['\x1B[36m', '\x1B[39m'],
  green: ['\x1B[32m', '\x1B[39m'],
  magenta: ['\x1B[36m', '\x1B[39m'],
  red: ['\x1B[31m', '\x1B[39m'],
  yellow: ['\x1B[33m', '\x1B[39m']
}

let levelColors = {
  error: colors.red,
  debug: colors.green,
  warn: colors.yellow,
  info: colors.blue
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
    if (process.env.DEBUG) { texts.unshift(this.getFileAndLine()) }

    var text = ((() => {
      let result = []
      for (text of Array.from(texts)) {
        result.push(this.stringify(text))
      }
      return result
    })()).join(' ')

    if (this.options.prefix != null) { text = `${this.options.prefix} | ${text}` }

    if (process.env.NODE_ENV !== 'production') {
      level = this.colorify(level, levelColors[level])
    }

    if (level) { text = `${level} - ${text}` }
    if (this.options.date) {
      let date = new Date().format(this.options.dateFormat)
      text = `[${date}] ${text}`
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

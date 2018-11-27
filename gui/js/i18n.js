let app

module.exports.init = (appRef) => {
  app = appRef
  app.translations = {}

  const locale = app.getLocale()
  app.locale = selectLocale(locale)

  app.translations = require(`../locales/${app.locale}.json`)
}

module.exports.translate = key => app.translations[key] ||
  key.substr(key.indexOf(' ') + 1) // Key without prefix

module.exports.interpolate = (string, ...args) => {
  return string.replace(/{(\d+)}/g, (_, index) => args[parseInt(index)])
}

module.exports.platformName = () => {
  switch (process.platform) {
    case 'darwin': return 'macOS'
    case 'freebsd': return 'FreeBSD'
    case 'linux': return 'Linux'
    case 'sunos': return 'SunOS'
    case 'win32': return 'Windows'
    default: return process.platform
  }
}

function selectLocale (locale) {
  const {enabled, defaultLocale} = require('../locales/locales.config.json')
  const globalLocale = new RegExp('^([a-z]{2})').exec(locale)
  return enabled.includes(globalLocale[1]) ? globalLocale[1] : defaultLocale
}

module.exports.selectLocale = selectLocale

/** GUI internationalization helpers.
 *
 * @module gui/js/i18n
 */

let app

const init = appRef => {
  app = appRef
  app.locale = 'en'
  app.translations = {}

  const locale = app.getLocale()
  if (locale === 'fr' || locale.match(/^fr_/i)) {
    app.locale = 'fr'
  } else if (locale === 'es' || locale.match(/^es_/i)) {
    app.locale = 'es'
  } else {
    app.locale = 'en'
  }

  app.translations = require(`../locales/${app.locale}.json`)
}

const buildTranslations = keys =>
  keys.reduce(
    (translations /*: { [string]: string } */, string /*: string */) => {
      translations[string] = translate(string)
      return translations
    },
    {}
  )

const translate = key =>
  app.translations[key] || key.substr(key.indexOf(' ') + 1) // Key without prefix

const interpolate = (string, ...args) => {
  return string.replace(/{(\d+)}/g, (_, index) => args[parseInt(index)])
}

const capitalize = string =>
  string.replace(string[0], string[0].toLocaleUpperCase(app.getLocale()))

const platformName = () => {
  switch (process.platform) {
    case 'darwin':
      return 'macOS'
    case 'freebsd':
      return 'FreeBSD'
    case 'linux':
      return 'Linux'
    case 'sunos':
      return 'SunOS'
    case 'win32':
      return 'Windows'
    default:
      return process.platform
  }
}

module.exports = {
  init,
  buildTranslations,
  translate,
  interpolate,
  capitalize,
  platformName
}

const { enabled } = require('./locales/locales.config.json')

module.exports = enabled.reduce(
  (acc, locale) =>
    Object.assign(acc, { [locale]: require(`./locales/${locale}.json`) }),
  {}
)

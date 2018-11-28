/* eslint-env mocha */

const should = require('should')
const { selectLocale } = require('../../../gui/js/i18n')
const {enabled, defaultLocale} = require('../../../gui/locales/locales.config.json')

describe('Select locale for app', () => {
  describe('Enabled locales', () => {
    enabled.forEach(enabledLocale => {
      it(`should select ${enabledLocale} as it is enabled`, () => {
        should(selectLocale(enabledLocale)).equal(enabledLocale)
      })
    })
    it('should select en if given locale is not enabled', () => {
      const targetLocale = 'xx'
      should(enabled.includes(targetLocale)).be.false()
      should(selectLocale(targetLocale)).equal(defaultLocale)
    })
  })
  describe('Reduce to global locale instead of country locale', () => {
    enabled.forEach(enabledLocale => {
      const localizedLocale = `${enabledLocale}_FR`
      it(`should select ${enabledLocale} for ${localizedLocale}`, () => {
        should(selectLocale(localizedLocale)).equal(enabledLocale)
      })
    })
    it('should be en for non activated locale', () => {
      const targetLocale = 'xx'
      const localizedLocale = `${targetLocale}_FR`
      should(enabled.includes(targetLocale)).be.false()
      should(selectLocale(localizedLocale)).equal('en')
    })
  })
})

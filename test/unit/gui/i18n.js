/* eslint-env mocha */

const should = require('should')
const { selectLocale } = require('../../../gui/js/i18n')

describe('Select locale for app', () => {
  describe('Activated locales', () => {
    it('should select fr as it is activated', () => {
      const targetLocale = selectLocale('fr')
      should(targetLocale).equal('fr')
    })
    it('should select es as it is activated', () => {
      const targetLocale = selectLocale('es')
      should(targetLocale).equal('es')
    })
    it('should select en if given locale is not activated', () => {
      const targetLocale = selectLocale('nl')
      should(targetLocale).equal('en')
    })
  })
  describe('Reduce to global locale instead of country locale', () => {
    it('should be fr for fr_FR', () => {
      const targetLocale = selectLocale('fr_FR')
      should(targetLocale).equal('fr')
    })
    it('should be es for es_SP', () => {
      const targetLocale = selectLocale('es_SP')
      should(targetLocale).equal('es')
    })
    it('should be en for non activated locale', () => {
      const targetLocale = selectLocale('nl_NL')
      should(targetLocale).equal('en')
    })
  })
})

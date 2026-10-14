/* @flow */
/* eslint-env mocha */

const should = require('should')

// The helper lives in build/, which flow ignores entirely.
// $FlowFixMe module in a flow-ignored directory
const { matchesPublisher } = require('../../build/windows/verify-publisher.js')
const config = require('../../electron-builder-config.js')

// Certificate subjects as reported by Get-AuthenticodeSignature / signtool.
// LINAGORA's subject comes from the updater log of 2026-10-14, the two
// others are hypothetical certificates used to pin the comparison semantics.
const LINAGORA_SUBJECT =
  'CN=LINAGORA SAS, O=LINAGORA SAS, L=Issy-les-Moulineaux, C=FR'
const OTHER_ORG_SAME_CN_SUBJECT = 'CN=LINAGORA SAS, O=Twake SAS, L=Paris, C=FR'
const OUTSIDER_SUBJECT = 'CN=Evil Corp, O=Evil Corp, L=Nowhere, C=US'

const publisherNames = [].concat(config.win.publisherName)

describe('Windows update signature publisherName', () => {
  it('is a list of bare CN entries', () => {
    should(publisherNames.length).be.above(0)
    for (const name of publisherNames) {
      should(name).be.a.String()
      should(name).not.containEql('=')
    }
  })

  it('accepts the certificate currently signing the app', () => {
    should(matchesPublisher(LINAGORA_SUBJECT, publisherNames)).be.true()
  })

  it('accepts a certificate of a group entity regardless of its other DN fields', () => {
    should(
      matchesPublisher(OTHER_ORG_SAME_CN_SUBJECT, publisherNames)
    ).be.true()
  })

  it('rejects a certificate from outside the group', () => {
    should(matchesPublisher(OUTSIDER_SUBJECT, publisherNames)).be.false()
  })

  it('compares CN entries case-sensitively', () => {
    should(matchesPublisher(LINAGORA_SUBJECT, ['Linagora SAS'])).be.false()
  })
})

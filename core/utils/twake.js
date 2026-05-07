/**
 * @module core/utils/twake
 * @flow
 */

/*::
export type TwakeConfiguration = {
  'twake-flagship-login-uri': string,
}
*/

const COZY_SCHEME = 'cozy'
const UNSECURE_DOMAINS = ['cozy.tools', 'localhost', 'nip.io']

const managerEnv = () /*: string */ => process.env.MANAGER_ENV || 'prod'

const managerURL = () /*: string */ => {
  switch (managerEnv()) {
    case 'local':
      return 'http://cloudery.localhost:3000'
    case 'dev':
      return 'https://manager-int.cozycloud.cc'
    case 'int':
      return 'https://manager-int.cozycloud.cc'
    case 'prod':
      return 'https://manager.cozycloud.cc'
    default:
      return 'https://manager.cozycloud.cc'
  }
}

const oidcRoute = () /*: string */ => {
  // XXX: Allow connecting to LNG instance using 'default' offer
  const offer = process.env.MANAGER_OFFER

  switch (managerEnv()) {
    case 'local':
      return offer || 'twake_prod'
    case 'dev':
      return offer || 'twake'
    case 'int':
      return offer || 'twake_stg'
    case 'prod':
      return offer || 'twake_prod'
    default:
      return offer || 'twake_prod'
  }
}

const oidcLoginURL = () /*: string */ => {
  return `${managerURL()}/linagora/${oidcRoute()}`
}

/**
 * Get Cozy Instance from FQDN
 *
 * Instance is computed from FQDN by adding a protocol to it
 *
 * 'cozy.tools', 'localhost', 'nip.io' URLs are enforced with
 * unsecure HTTP protocol
 *
 * @param fqdn - Cozy's FQDN
 * @returns the computed Instance URL as string
 */
const getInstanceFromFqdn = (fqdn /*: string */) /*: string */ => {
  const instance = getURLWithEnforcedProtocol(fqdn)

  return removeTrailingSlash(instance.toString())
}

const getURLWithEnforcedProtocol = (uri /*: string */) /*: URL */ => {
  const uriWithProtocol = hasProtocol(uri) ? uri : `https://${uri}`
  const url = new URL(uriWithProtocol)

  if (isUnsecureDomain(url.hostname)) {
    url.protocol = 'http'
  }

  return url
}

const hasProtocol = (url /*: string */) /*: boolean */ => {
  return url.includes('://')
}

const isUnsecureDomain = (domain /*: string */) /*: boolean */ => {
  return UNSECURE_DOMAINS.some(d => domain.endsWith(d))
}

const removeTrailingSlash = (value /*: string */) /*: string */ => {
  return value.replace(/\/$/, '')
}

module.exports = {
  COZY_SCHEME,
  managerEnv,
  managerURL,
  oidcRoute,
  oidcLoginURL,
  getInstanceFromFqdn,
  isUnsecureDomain
}

/* @flow */

const cheerio = require('cheerio')
const request = require('request-promise')
const url = require('url')
const logger = require('../../core/logger')
const Registration = require('../../core/remote/registration')

const log = logger({
  component: 'remote/automated_registration'
})

const client = request.defaults({
  jar: true, // Enable cookies so the stack doesn't change the CSRF token.
  resolveWithFullResponse: true, // So we can check headers & status code.
  simple: false, // Don't reject on redirect (e.g. after login).
  timeout: 120000 // Registration from AppVeyor can be slow.
})

/** Resolve with the CSRF token from the cozy-stack login page.
 *
 * So we can use it in the actual `login()`.
 */
const _getCsrfToken = async cozyUrl => {
  log.debug('Get CSRF token...')
  const { body } = await client.get({ url: cozyUrl('/auth/login') })
  const $ = cheerio.load(body)
  const csrf_token = $('#csrf_token').val()
  if (`${csrf_token}` === '') {
    throw new Error(
      `Could not parse CSRF token from login page:\n  ${$.text()}`
    )
  } else {
    return csrf_token
  }
}

/** Login to the Cozy using `getCsrfToken()` result.
 *
 * Resolves when login is successful. Rejects otherwise.
 */
const login = async (cozyUrl, passphrase) => {
  const csrf_token = await _getCsrfToken(cozyUrl)
  log.debug({ csrf_token }, 'Login...')
  const form = { passphrase, csrf_token }
  const response = await client.post({
    url: cozyUrl('/auth/login'),
    form
  })
  if (!response.headers.location) {
    const $ = cheerio.load(response.body)
    throw new Error(
      `Login failed (no redirect, code ${response.statusCode}):\n  ${$.text()}`
    )
  }
}

/** Retrieve the form fields expected by `authorize()`.
 *
 * - `authorizeUrl` is the one provided by `core/remote/registration`.
 *
 * Resolves when the form fields could be parsed from the authorization page.
 * Rejects otherwise.
 */
const _getAuthorizationForm = async authorizeUrl => {
  log.debug('Load authorization form...')
  const authorizePageResp = await client({ url: authorizeUrl })

  log.debug('Parse authorization form...')
  const $ = cheerio.load(authorizePageResp.body)
  return $('form.auth')
    .serializeArray()
    .reduce((data, param) => {
      data[param.name] = param.value
      return data
    }, {})
}

/** Authorize the client.
 *
 * - `authorizeUrl` is the one provided by `core/remote/registration`.
 *
 * Resolves with the URL to follow in order to finalize registration.
 * Rejects when the response is not a redirection.
 */
const authorize = async authorizeUrl => {
  const form = await _getAuthorizationForm(authorizeUrl)
  log.debug('Authorize...')
  const res = await client.post({ url: authorizeUrl, form })
  const redirectUrl = res.headers.location

  if (redirectUrl) {
    return res.headers.location
  } else {
    const $ = cheerio.load(res.body)
    throw new Error(
      `Authorization failed (code ${res.statusCode}):\n  ${$.text()}`
    )
  }
}

/** An automated Registration instance using the cozy-stack Web interface. */
const automatedRegistration = (
  cozyBaseUrl /*: string */,
  passphrase /*: string */,
  storage /*: * */
) /*: Registration */ => {
  const cozyUrl = path => new url.URL(cozyBaseUrl + path)
  const saveCredentials = async redirectUrl => {
    log.debug('Saving credentials...')
    await client({ url: redirectUrl })
  }

  return new Registration(cozyBaseUrl, storage, async authorizeUrl => {
    await login(cozyUrl, passphrase)
    const redirectUrl = await authorize(authorizeUrl)
    await saveCredentials(redirectUrl)
    return cozyUrl
  })
}

module.exports = automatedRegistration

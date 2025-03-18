/** Automated registration for testing purpose (e.g. AppVeyor vs remote Cozy).
 *
 * @module dev/remote/automated_registration
 * @flow
 */

const crypto = require('crypto')
const url = require('url')

const cheerio = require('cheerio')

const Registration = require('../../core/remote/registration')
const { logger } = require('../../core/utils/logger')

const log = logger({
  component: 'remote/automated_registration'
})

/** Transform an object into an `x-www-form-urlencoded` string */
const formBody = form => {
  const body = []
  for (const key in form) {
    const encodedKey = encodeURIComponent(key)
    var encodedValue = encodeURIComponent(form[key])
    body.push(encodedKey + '=' + encodedValue)
  }
  return body.join('&')
}

/** Resolve with the CSRF token from the cozy-stack login page.
 *
 * So we can use it in the actual `login()`.
 */
const _getLoginInfo = async cozyUrl => {
  log.debug('Get CSRF token...')
  const res = await fetch(cozyUrl('/auth/login'))
  const body = await res.text()
  const $ = cheerio.load(body)
  const csrf_token = $('#csrf_token').val()
  if (`${csrf_token}` === '') {
    throw new Error(`Could not parse CSRF token from login page:\n  ${body}`)
  }
  const form = $('#login-form')
  const salt = form.data('salt')
  const iterations = parseInt(form.data('iterations'), 10)
  return { csrf_token, salt, iterations }
}

const _hashPassphrase = async (passphrase, salt, iterations) => {
  const master = crypto.pbkdf2Sync(passphrase, salt, iterations, 32, 'sha256')
  const hash = crypto.pbkdf2Sync(master, passphrase, 1, 32, 'sha256')
  return hash.toString('base64')
}

/** Login to the Cozy using `getCsrfToken()` result.
 *
 * Resolves when login is successful. Rejects otherwise.
 */
const login = async (cozyUrl, passphrase) => {
  const { csrf_token, salt, iterations } = await _getLoginInfo(cozyUrl)
  log.debug('Login...', { csrf_token })
  if (!csrf_token) {
    log.debug('Already logged in. Skipping login')
    return
  }
  if (iterations > 0) {
    passphrase = await _hashPassphrase(passphrase, salt, iterations)
  }
  const response = await fetch(cozyUrl('/auth/login'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      passphrase,
      'two-factor-trusted-device-token': '',
      'long-run-session': '1',
      redirect: '',
      csrf_token
    })
  })
  const body = await response.json()
  if (!body.redirect) {
    throw new Error(
      `Login failed (no redirect, code ${response.status}):\n  ${body}`
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
  const authorizePageResp = await fetch(authorizeUrl)

  log.debug('Parse authorization form...')
  const $ = cheerio.load(await authorizePageResp.text())
  return $('form')
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
  const res = await fetch(authorizeUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: formBody(form)
  })
  const body = await res.json()
  const redirectUrl = body.deeplink

  if (redirectUrl) {
    return redirectUrl
  } else {
    throw new Error(
      `Authorization failed (code ${res.status}):\n  ${JSON.stringify(body)}`
    )
  }
}

/** An automated Registration instance using the cozy-stack Web interface. */
const automatedRegistration = (
  cozyBaseUrl /*: string */,
  passphrase /*: string */,
  config /*: * */
) /*: Registration */ => {
  const cozyUrl = path => new url.URL(path, cozyBaseUrl).toString()
  const completeRegistration = async redirectUrl => {
    log.debug('Completing registration...')
    await fetch(redirectUrl)
  }

  return new Registration(cozyBaseUrl, config, async authorizeUrl => {
    await login(cozyUrl, passphrase)
    const redirectUrl = await authorize(authorizeUrl)
    await completeRegistration(redirectUrl)
  })
}

module.exports = automatedRegistration

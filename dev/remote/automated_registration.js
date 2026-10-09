/* Automated registration for testing purpose (e.g. AppVeyor vs remote Cozy).
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

// Transform an object into an `x-www-form-urlencoded` string
const formBody = form => {
  const body = []
  for (const key in form) {
    const encodedKey = encodeURIComponent(key)
    var encodedValue = encodeURIComponent(form[key])
    body.push(encodedKey + '=' + encodedValue)
  }
  return body.join('&')
}

/* Fetch an URL following only the same-host redirects manually, and resolve
 * with the host of the first redirect landing on another host (or `null`),
 * the last response and its URL.
 *
 * This must not rely on `response.url`: `network.setup` replaces
 * `global.fetch` with `electron-fetch`, which lets Electron's net stack
 * follow redirects internally, so the reported `response.url` always is the
 * original request URL. Electron's net stack also ignores the
 * `redirect: 'manual'` option, hence `useElectronNet: false` to force
 * electron-fetch's Node.js code path where it is honored.
 */
const _fetchLoginPage = async (loginUrl /*: string */) => {
  const options /*: any */ = { redirect: 'manual', useElectronNet: false }
  let next = loginUrl
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(next, options)
    const location = res.headers.get('location')
    if (res.status < 300 || res.status >= 400 || !location) {
      return { redirectHost: null, res, finalUrl: next }
    }
    const dest = new url.URL(location, next)
    if (dest.host !== new url.URL(loginUrl).host) {
      return { redirectHost: dest.host, res, finalUrl: dest.toString() }
    }
    next = dest.toString()
  }
  throw new Error(`Too many redirects while loading ${loginUrl}`)
}

/* Resolve with the CSRF token from the cozy-stack login page.
 *
 * So we can use it in the actual `login()`.
 */
const _getLoginInfo = async cozyUrl => {
  log.debug('Get CSRF token...')
  const loginUrl = cozyUrl('/auth/login')
  const { redirectHost: ssoHost, res } = await _fetchLoginPage(loginUrl)

  // An instance behind an OIDC SSO redirects its login page to an external
  // host, which the native flow simulated here cannot handle: fail early
  // with an explicit message instead of derailing silently.
  if (ssoHost) {
    throw new Error(
      `Instance login page redirects to an external host (${ssoHost}), ` +
        'most probably an OIDC SSO: the automated native registration cannot ' +
        'be used against such an instance. ' +
        'See https://github.com/cozy-labs/cozy-desktop/issues/2492'
    )
  }

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

/* Login to the Cozy using `getCsrfToken()` result.
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

/* Retrieve the form fields expected by `authorize()`.
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

/* Authorize the client.
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

// The SSO governing the Twake Workplace instances
const SSO_BASE_URL = 'https://sign-up.twake.app'
// The manager (cloudery) brokering the OIDC delegation to the instances.
const MANAGER_BASE_URL = 'https://manager.cozycloud.cc'
// Salt prefix used by the SSO to derive the passphrase hash.
const SSO_SALT_PREFIX = 'me@'
/* The URL scheme the desktop app registers to receive the delegation
 * deeplink. We only need to read the redirect target, not to follow it.
 */
const DEEPLINK_SCHEME = 'cozy:'
// The route of the manager handing out OIDC login URLs for Twake Workplace.
const MANAGER_OIDC_ROUTE = 'twake_prod'
const USER_AGENT = 'Mozilla/5.0'

/* Collect the cookies set by a response, keyed by host, session cookies
 * only (drop the attributes).
 *
 * `getSetCookie()` is the WHATWG way (undici); electron-fetch's `Headers`
 * predates it but exposes the raw header map through `raw()`, where
 * `set-cookie` stays an array.
 */
const _addCookies = (
  jar /*: Object */,
  host /*: string */,
  headers /*: any */
) => {
  const getSetCookie = headers.getSetCookie
  const raw = headers.raw
  const values = getSetCookie
    ? getSetCookie.call(headers)
    : raw
    ? raw.call(headers)['set-cookie'] || []
    : []
  jar[host] = [
    ...new Set([
      ...(jar[host] || []),
      ...values.map(cookie => cookie.split(';')[0])
    ])
  ]
}

/* Detect whether the instance is behind an OIDC SSO.
 *
 * The login page of such an instance redirects to an external host (the
 * SSO), while a native instance serves its own login form.
 */
const isSsoInstance = async (
  cozyBaseUrl /*: string */
) /*: Promise<boolean> */ => {
  const loginUrl = new url.URL('/auth/login', cozyBaseUrl).toString()
  const { redirectHost } = await _fetchLoginPage(loginUrl)
  return redirectHost !== null
}

/* Resolve with the SSO delegation `code` and instance `fqdn` for the
 * instance at `cozyBaseUrl`.
 *
 * Simulates headlessly the browser flow of the desktop app onboarding:
 * 1. authenticate against the SSO with the instance FQDN as login and the
 *    passphrase hashed the way the SSO web app does (PBKDF2-SHA256 with
 *    `me@<domain>` as salt, then PBKDF2-SHA256 with the passphrase itself
 *    as salt, i.e. the same derivation as `_hashPassphrase`),
 * 2. follow the delegation chain from the manager down to the `cozy://`
 *    deeplink carrying the delegation code and the instance FQDN.
 *
 * The returned code is meant to be exchanged by
 * `Registration.registerWithDelegationCode()`, which registers a fresh
 * OAuth client on the instance and trades the code for an access token.
 */
const ssoDelegationCode = async (
  cozyBaseUrl /*: string */,
  passphrase /*: string */
) /*: Promise<{ code: string, fqdn: string }> */ => {
  const login = new url.URL(cozyBaseUrl).host

  log.debug('Get SSO auth context...')
  // `useElectronNet: false` forces electron-fetch's Node.js code path:
  // under Electron's net stack, redirects are followed internally and the
  // `redirect: 'manual'` option is ignored, which the delegation chain
  // below cannot work with.
  const ssoFetchOptions /*: any */ = { useElectronNet: false }
  const ctxRes = await fetch(`${SSO_BASE_URL}/api/auth-context`, {
    ...ssoFetchOptions,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: SSO_BASE_URL },
    body: JSON.stringify({ login })
  })
  if (!ctxRes.ok) {
    throw new Error(
      `Could not get SSO auth context for ${login} (code ${ctxRes.status})`
    )
  }
  const { domain, iterations } = await ctxRes.json()
  if (!domain || !iterations) {
    throw new Error(
      `Unexpected SSO auth context for ${login}:\n  ${JSON.stringify({
        domain,
        iterations
      })}`
    )
  }

  log.debug('Load SSO login page...')
  const page = await fetch(`${SSO_BASE_URL}/`, {
    ...ssoFetchOptions,
    headers: { 'User-Agent': USER_AGENT }
  })
  await page.text()
  const jar = {}
  _addCookies(jar, 'sign-up.twake.app', page.headers)

  log.debug('Login to the SSO...')
  const hashed = await _hashPassphrase(
    passphrase,
    `${SSO_SALT_PREFIX}${domain}`,
    iterations
  )
  const loginRes = await fetch(`${SSO_BASE_URL}/?/login`, {
    ...ssoFetchOptions,
    method: 'POST',
    headers: {
      Origin: SSO_BASE_URL,
      'x-sveltekit-action': 'true',
      Cookie: jar['sign-up.twake.app'].join('; '),
      'User-Agent': USER_AGENT
    },
    body: formBody({ login, password: hashed })
  })
  _addCookies(jar, 'sign-up.twake.app', loginRes.headers)
  const loginBody = await loginRes.text()
  let loginResult
  try {
    loginResult = JSON.parse(loginBody)
  } catch (e) {
    loginResult = null
  }
  if (
    loginRes.status !== 200 ||
    !loginResult ||
    (loginResult.type !== 'success' && loginResult.type !== 'redirect')
  ) {
    throw new Error(
      `SSO login failed (code ${loginRes.status}):\n  ${loginBody.slice(
        0,
        200
      )}`
    )
  }

  log.debug('Follow the SSO delegation chain...')
  let next = `${MANAGER_BASE_URL}/linagora/${MANAGER_OIDC_ROUTE}?redirect_after_oidc=${DEEPLINK_SCHEME}//`
  for (let hop = 0; hop < 6; hop++) {
    const target = new url.URL(next)
    const res = await fetch(next, {
      ...ssoFetchOptions,
      redirect: 'manual',
      headers: {
        'User-Agent': USER_AGENT,
        Cookie: (jar[target.host] || []).join('; ')
      }
    })
    _addCookies(jar, target.host, res.headers)
    const location = res.headers.get('location')
    if (!location) {
      throw new Error(
        `SSO delegation chain ended unexpectedly at ${target.host}${target.pathname} (code ${res.status})`
      )
    }
    const dest = new url.URL(location, next)
    if (dest.protocol === DEEPLINK_SCHEME) {
      const code = dest.searchParams.get('code')
      const fqdn = dest.searchParams.get('fqdn')
      if (!code || !fqdn) {
        throw new Error(
          `SSO delegation deeplink is missing code or fqdn:\n  ${dest.toString()}`
        )
      }
      return { code, fqdn }
    }
    next = dest.toString()
  }
  throw new Error(
    'SSO delegation chain did not reach the deeplink (too many hops)'
  )
}

// An automated Registration instance using the cozy-stack Web interface
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

module.exports = { automatedRegistration, isSsoInstance, ssoDelegationCode }

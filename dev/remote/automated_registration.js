/* Automated registration for testing purpose (e.g. AppVeyor vs remote Cozy).
 *
 * @module dev/remote/automated_registration
 * @flow
 */

const crypto = require('crypto')
const url = require('url')

const cheerio = require('cheerio')

const { Registration } = require('../../core/remote/registration')
const { logger } = require('../../core/utils/logger')
const { oidcLoginURL } = require('../../core/utils/twake')

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
  // The login page was fetched through electron-fetch's Node.js code path,
  // which does not share Electron's session cookie jar: forward its cookies
  // explicitly so the login POST can validate the CSRF token.
  const jar = {}
  _addCookies(jar, new url.URL(loginUrl).host, res.headers)
  return {
    csrf_token,
    salt,
    iterations,
    cookies: jar[new url.URL(loginUrl).host] || []
  }
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
  const { csrf_token, salt, iterations, cookies } = await _getLoginInfo(cozyUrl)
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
      'content-type': 'application/x-www-form-urlencoded',
      ...(cookies.length ? { Cookie: cookies.join('; ') } : {})
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

// Salt prefix used by the SSO to derive the passphrase hash.
const SSO_SALT_PREFIX = 'me@'
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

/* Discover the SSO context for the instance at `cozyBaseUrl`.
 *
 * The login page of an SSO-governed instance redirects to an external OAuth
 * authorize URL carrying everything needed to continue the flow: the SSO
 * origin, the user's login hint and the redirect URI waiting for the
 * delegation code. A native instance serves its own login form instead.
 *
 * Resolves with `{ ssoBase, login, authorizeURL, redirectURI }` when the
 * instance is behind an SSO, `null` otherwise.
 */
const getSsoContext = async (
  cozyBaseUrl /*: string */
) /*: Promise<?{ ssoBase: string, login: string, authorizeURL: url.URL, redirectURI: string }> */ => {
  const loginUrl = new url.URL('/auth/login', cozyBaseUrl).toString()
  const { redirectHost, finalUrl } = await _fetchLoginPage(loginUrl)
  if (!redirectHost) return null

  const authorizeURL = new url.URL(finalUrl)
  // An SSO authorize URL without `redirect_uri` cannot continue the flow.
  const redirectURI = authorizeURL.searchParams.get('redirect_uri')
  if (!redirectURI) {
    throw new Error('SSO authorize URL is missing a redirect_uri parameter')
  }
  return {
    ssoBase: authorizeURL.origin,
    login:
      authorizeURL.searchParams.get('login_hint') ||
      new url.URL(cozyBaseUrl).host,
    authorizeURL,
    redirectURI
  }
}

/* Resolve with the SSO delegation `code` and instance `fqdn` for the
 * context discovered by `getSsoContext()`.
 *
 * Simulates headlessly the browser flow of the desktop app onboarding:
 * 1. authenticate against the SSO with the login hint discovered from the
 *    instance and the passphrase hashed the way the SSO web app does
 *    (PBKDF2-SHA256 with `me@<domain>` as salt, then PBKDF2-SHA256 with the
 *    passphrase itself as salt, i.e. the same derivation as
 *    `_hashPassphrase`),
 * 2. follow the delegation chain from the manager down to the local
 *    callback URL, carrying the delegated code and the instance FQDN.
 *
 * The returned code is meant to be exchanged by
 * `Registration.registerWithDelegationCode()`, which registers a fresh
 * OAuth client on the instance and trades the code for an access token.
 */
const _ssoDelegationCode = async (
  ctx /*: {
    ssoBase: string,
    login: string,
    authorizeURL: url.URL,
    redirectURI: string
  } */,
  passphrase /*: string */
) /*: Promise<{ code: string, fqdn: string, redirectURI: string }> */ => {
  const { ssoBase, login } = ctx
  const ssoHost = new url.URL(ssoBase).host

  log.debug('Get SSO auth context...')
  // `useElectronNet: false` forces electron-fetch's Node.js code path:
  // under Electron's net stack, redirects are followed internally and the
  // `redirect: 'manual'` option is ignored, which the code capture below
  // cannot work with.
  const ssoFetchOptions /*: any */ = { useElectronNet: false }
  const ctxRes = await fetch(`${ssoBase}/api/auth-context`, {
    ...ssoFetchOptions,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ssoBase },
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
  const page = await fetch(`${ssoBase}/`, {
    ...ssoFetchOptions,
    headers: { 'User-Agent': USER_AGENT }
  })
  await page.text()
  const jar = {}
  _addCookies(jar, ssoHost, page.headers)

  log.debug('Login to the SSO...')
  const hashed = await _hashPassphrase(
    passphrase,
    `${SSO_SALT_PREFIX}${domain}`,
    iterations
  )
  const loginRes = await fetch(`${ssoBase}/?/login`, {
    ...ssoFetchOptions,
    method: 'POST',
    headers: {
      Origin: ssoBase,
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-sveltekit-action': 'true',
      Cookie: jar[ssoHost].join('; '),
      'User-Agent': USER_AGENT
    },
    body: formBody({ login, password: hashed })
  })
  _addCookies(jar, ssoHost, loginRes.headers)
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

  // The delegated code is minted by the cozy-stack through its admin
  // endpoint, which only the cloudery (manager) can call. The OAuth code
  // issued by the SSO itself is refused by `/oidc/access_token`, so the
  // delegation must go through the manager: it authenticates the user via
  // the SSO session established above, then redirects to the local callback
  // with the delegated code and the instance FQDN.
  log.debug('Follow the manager delegation chain...')
  const callbackURL = `http://127.0.0.1:3344/callback?state=${crypto
    .randomBytes(16)
    .toString('hex')}`
  let next = `${oidcLoginURL()}?redirect_after_oidc=${encodeURIComponent(
    callbackURL
  )}`
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
    if (dest.host === new url.URL(callbackURL).host) {
      // Capture the delegated code from the redirect without following it:
      // nothing needs to listen on the callback URL.
      const code = dest.searchParams.get('code')
      const fqdn = dest.searchParams.get('fqdn')
      if (!code || !fqdn) {
        throw new Error(
          `OIDC callback is missing code or fqdn:\n  ${dest.toString()}`
        )
      }
      return { code, fqdn, redirectURI: callbackURL }
    }
    next = dest.toString()
  }
  throw new Error(
    'SSO delegation chain did not reach the local callback (too many hops)'
  )
}

/* Resolve with the SSO delegation code and the instance redirect URI.
 *
 * - `ctx` is the one provided by `getSsoContext()`, or `null` when the
 *   instance is not behind an SSO.
 */
const ssoDelegationCode = async (
  ctx /*: ?{ ssoBase: string, login: string, authorizeURL: url.URL, redirectURI: string } */,
  passphrase /*: string */
) /*: Promise<{ code: string, redirectURI: string }> */ => {
  if (!ctx) {
    throw new Error('Instance is not behind an SSO: no delegation context')
  }
  return _ssoDelegationCode(ctx, passphrase)
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

module.exports = { automatedRegistration, getSsoContext, ssoDelegationCode }

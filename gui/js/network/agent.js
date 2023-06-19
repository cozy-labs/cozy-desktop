/** Custom Node `http.Agent` implementation to route requests through a proxy.
 *
 * Based on https://github.com/TooTallNate/proxy-agents/blob/2f835a41f265280192b82556db80ccbe67140753/packages/proxy-agent/src/index.ts
 * with the added possibility to pass an async function as `getProxyForUrl`.
 *
 * @module gui/js/network/agent
 * @flow
 */

const http = require('http')
const https = require('https')
const { LRUCache } = require('lru-cache')
const { Agent } = require('agent-base')
const { PacProxyAgent } = require('pac-proxy-agent')
const { HttpProxyAgent } = require('http-proxy-agent')
const { HttpsProxyAgent } = require('https-proxy-agent')
const { SocksProxyAgent } = require('socks-proxy-agent')

const logger = require('../../../core/utils/logger')
const log = logger({
  component: 'ProxyAgent'
})

const PROTOCOLS = [
  'http',
  'https',
  'socks',
  'socks4',
  'socks4a',
  'socks5',
  'socks5h',
  'pac-data',
  'pac-file',
  'pac-ftp',
  'pac-http',
  'pac-https'
]

/*::
type GetProxyForUrlCallback = (url: string) => Promise<string>;

import type { Session } from 'electron'
import type { PacProxyAgentOptions } from 'pac-proxy-agent'
import type { HttpProxyAgentOptions } from 'http-proxy-agent'
import type { HttpsProxyAgentOptions } from 'https-proxy-agent'
import type { SocksProxyAgentOptions } from 'socks-proxy-agent'

// Options type from the `proxy-agent` package.
type ProxyAgentOptions = HttpProxyAgentOptions<''> &
  HttpsProxyAgentOptions<''> &
  SocksProxyAgentOptions &
  PacProxyAgentOptions<''> & {
    // Default `http.Agent` instance to use when no proxy is
    // configured for a request. Defaults to a new `http.Agent()`
    // instance with the proxy agent options passed in.
    httpAgent?: http.Agent,

    // Default `http.Agent` instance to use when no proxy is
    // configured for a request. Defaults to a new `https.Agent()`
    // instance with the proxy agent options passed in.
    httpsAgent?: http.Agent,

    // A callback for dynamic provision of proxy for url.
    // Defaults to standard proxy environment variables,
    // see https://www.npmjs.com/package/proxy-from-env for details
    getProxyForUrl?: GetProxyForUrlCallback,
  };

// ProxyAgent options for our own needs.
type CustomProxyAgentOptions = {
  // Protocol to use for requests when it is not defined in the
  // request's options and we somehow fallback to the `ProxyAgent` protocol.
  // This will most likely be used with `https:` to make sure secure requests
  // don't fail when wrapped by Sentry.
  protocol?: string,
}

type AgentConnectOpts = ProxyAgentOptions & CustomProxyAgentOptions
*/

/**
 * Supported proxy types.
 */
const proxies = {
  http: [HttpProxyAgent, HttpsProxyAgent],
  https: [HttpProxyAgent, HttpsProxyAgent],
  socks: [SocksProxyAgent, SocksProxyAgent],
  socks4: [SocksProxyAgent, SocksProxyAgent],
  socks4a: [SocksProxyAgent, SocksProxyAgent],
  socks5: [SocksProxyAgent, SocksProxyAgent],
  socks5h: [SocksProxyAgent, SocksProxyAgent],
  'pac-data': [PacProxyAgent, PacProxyAgent],
  'pac-file': [PacProxyAgent, PacProxyAgent],
  'pac-ftp': [PacProxyAgent, PacProxyAgent],
  'pac-http': [PacProxyAgent, PacProxyAgent],
  'pac-https': [PacProxyAgent, PacProxyAgent]
}

function isValidProtocol(v /*: string */) /*: boolean %checks */ {
  return PROTOCOLS.includes(v)
}

/**
 * Uses the appropriate `Agent` subclass based off of the "proxy"
 * environment variables that are currently set.
 *
 * An LRU cache is used, to prevent unnecessary creation of proxy
 * `http.Agent` instances.
 */
class ProxyAgent extends Agent {
  /*::
	// Cache for `Agent` instances.
	cache: LRUCache<string, Agent>

	connectOpts: AgentConnectOpts
	httpAgent: http.Agent
	httpsAgent: http.Agent
	getProxyForUrl: GetProxyForUrlCallback
	*/

  constructor(opts /*:: ?: AgentConnectOpts */ = {}) {
    super(opts)
    log.debug({ opts }, 'Creating new ProxyAgent instance')
    this.cache = new LRUCache({ max: 20 })
    this.connectOpts = opts

    const { httpAgent, httpsAgent, getProxyForUrl, protocol } = opts
    this.httpAgent = httpAgent || new http.Agent(opts)
    this.httpsAgent = httpsAgent || new https.Agent(opts)
    this.getProxyForUrl = getProxyForUrl || (async () => '')
    this.protocol = protocol
  }

  async connect(
    req /*: http.ClientRequest */,
    opts /*: AgentConnectOpts */
  ) /*: Promise<http.Agent> */ {
    const { secureEndpoint } = opts
    const isWebSocket = req.getHeader('upgrade') === 'websocket'
    const protocol = secureEndpoint
      ? isWebSocket
        ? 'wss:'
        : 'https:'
      : isWebSocket
      ? 'ws:'
      : 'http:'
    const host = req.getHeader('host')
    // $FlowFixMe `http.ClientRequest` does have a `path` attribute
    const url = new URL(req.path, `${protocol}//${host}`).href
    const proxy = await this.getProxyForUrl(url)

    if (!proxy) {
      log.debug('Proxy not enabled for URL: %o', url)
      return secureEndpoint ? this.httpsAgent : this.httpAgent
    }

    log.debug('Request URL: %o', url)
    log.debug('Proxy URL: %o', proxy)

    // attempt to get a cached `http.Agent` instance first
    const cacheKey = `${protocol}+${proxy}`
    let agent = this.cache.get(cacheKey)
    if (!agent) {
      const proxyUrl = new URL(proxy)
      const proxyProto = proxyUrl.protocol.replace(':', '')
      if (!isValidProtocol(proxyProto)) {
        throw new Error(`Unsupported protocol for proxy URL: ${proxy}`)
      }
      const ctor = proxies[proxyProto][secureEndpoint || isWebSocket ? 1 : 0]
      // @ts-expect-error meh…
      agent = new ctor(proxy, this.connectOpts)
      this.cache.set(cacheKey, agent)
    } else {
      log.debug('Cache hit for proxy URL: %o', proxy)
    }

    return agent
  }

  destroy() /*: void */ {
    for (const agent of this.cache.values()) {
      agent.destroy()
    }
    super.destroy()
  }
}

// getProxyForUrl uses the given Electron Session to resolve the proxy to use
// for the given requested URL and returns its URL.
// It is meant to be used with `ProxyAgent`.
const getProxyForUrl =
  (session /*: Session */) => async (reqUrl /*: string */) => {
    log.info({ reqUrl }, 'getProxyForUrl')
    const proxy = await session.resolveProxy(reqUrl)
    if (!proxy) {
      return ''
    }

    const proxies = String(proxy)
      .trim()
      .split(/\s*;\s*/g)
      .filter(Boolean)

    // XXX: right now, only the first proxy specified will be used
    const first = proxies[0]
    const [type, addr] = first.split(/\s+/)

    if ('DIRECT' == type) {
      return ''
    } else if ('PROXY' == type) {
      return `http://${addr}`
    } else if (['SOCKS', 'SOCKS5', 'HTTPS'].includes(type)) {
      return `${type.toLowerCase()}://${addr}`
    } else {
      log.error({ type, reqUrl }, 'Unknown proxy type')
      return ''
    }
  }

module.exports = {
  ProxyAgent,
  getProxyForUrl
}

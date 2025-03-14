/* @flow */

const { default: CozyClient } = require('cozy-client')

/*::
export type OAuthClient = {
  clientID: string,
  clientSecret: string,
  registrationAccessToken: string,
  redirectURI: string,
  softwareID: string,
  softwareVersion: string,
  clientName: string,
  clientKind: string,
  clientURI: string,
  logoURI: string,
  policyURI: string,
  notificationPlatform: string,
  notificationDeviceToken: string,
}

export type OAuthTokens = {
  tokenType: string,
  accessToken: string,
  refreshToken: string,
  scope: string,
}

// The attributes match those of Config for simpler usage
export type ClientOptions = $ReadOnly<{
  cozyUrl: string,
  client: OAuthClient,
  oauthTokens: ?OAuthTokens,
  onTokenRefresh: ?(OAuthTokens) => any,
}>
*/

function createClient(
  { cozyUrl, client, oauthTokens, onTokenRefresh } /*: ClientOptions */
) /*: CozyClient */ {
  const scope = (oauthTokens && oauthTokens.scope) || [
    'io.cozy.files',
    'io.cozy.settings:GET:io.cozy.settings.disk-usage',
    'io.cozy.jobs:POST:sendmail:worker'
  ]

  return new CozyClient({
    uri: cozyUrl,
    oauth: client,
    token: oauthTokens,
    scope,
    throwFetchErrors: true,
    onTokenRefresh
  })
}

// TODO: modify CozyClient in `cozy-client` to allow passing an openURLCallback
// function to CozyClient.register() and avoid reimplementing it here.
async function registerClient(
  client /*: CozyClient */,
  { openURLCallback } /*: $ReadOnly<{ openURLCallback: (string) => any }> */
) {
  const stackClient = client.getStackClient()
  await stackClient.register()
  return client.authorize({ openURLCallback })
}

async function loginAndSaveClient(
  client /*: CozyClient */,
  storage /*: { -client: OAuthClient, -oauthTokens: OAuthTokens } */
) {
  await client.login()
  saveOauthClient(client, storage)
}

function saveOauthClient(
  client /*: CozyClient */,
  storage /*: { -client: OAuthClient, -oauthTokens: OAuthTokens } */
) {
  const { oauthOptions, token } = client.getStackClient()

  storage.client = oauthOptions
  storage.oauthTokens = token
}

module.exports = {
  createClient,
  registerClient,
  loginAndSaveClient
}

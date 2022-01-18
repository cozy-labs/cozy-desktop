/* @flow */

const path = require('path')
const { generateWebLink } = require('cozy-client')

const capabilities = require('./capabilities')
const logger = require('./logger')

const log = new logger({
  component: 'Web'
})

/*::
import type { Config } from '../config'
import type { Pouch } from '../pouch'
import type { Metadata } from '../metadata'
*/

const findDoc = async (
  filePath /*: string */,
  { config, pouch } /*: { config: Config, pouch: Pouch } */
) /*: Promise<Metadata> */ => {
  const relPath = path.relative(config.syncPath, filePath)
  return pouch.bySyncedPath(relPath)
}

async function findDocument(
  filePath /*: string */,
  { config, pouch } /*: { config: Config, pouch: Pouch } */
) /*: Promise<{ driveWebUrl: string }> */ {
  const { cozyUrl } = config
  const { flatSubdomains } = await capabilities(config)

  const doc =
    filePath === '' ? null : await findDoc(filePath, { config, pouch })

  if (doc) {
    const hash = doc.remote
      ? doc.remote.type === 'directory'
        ? `folder/${doc.remote._id}`
        : `folder/${doc.remote.dir_id}/file/${doc.remote._id}`
      : ''
    log.debug({ path: filePath, doc, hash }, 'findDocument')

    return {
      driveWebUrl: generateWebLink({
        cozyUrl,
        searchParams: [],
        pathname: '',
        hash,
        slug: 'drive',
        subDomainType: flatSubdomains ? 'flat' : 'nested'
      })
    }
  } else {
    log.debug({ path: filePath, doc }, 'findDocument')

    return {
      driveWebUrl: generateWebLink({
        cozyUrl,
        searchParams: [],
        pathname: '',
        hash: '',
        slug: 'drive',
        subDomainType: flatSubdomains ? 'flat' : 'nested'
      })
    }
  }
}

module.exports = { findDocument }

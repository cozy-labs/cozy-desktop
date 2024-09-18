/**
 * @module gui/notes
 * @flow
 */

const { shell } = require('electron')

const Desktop = require('../../core/app.js')

const log = Desktop.logger({
  component: 'GUI'
})

/*::
import { App } from '../../core/app'
*/

const openInWeb = async (
  filePath /*: string */,
  { desktop } /*: { desktop: App } */
) => {
  try {
    const { driveWebUrl } = await desktop.findDocument(filePath)
    shell.openExternal(driveWebUrl)
  } catch (err) {
    log.error('Could not find or open remote document', {
      err,
      path: filePath,
      filePath,
      sentry: true
    })
    return false
  }
  return true
}

module.exports = { openInWeb }

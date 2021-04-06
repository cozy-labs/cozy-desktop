/**
 * @module gui/utils/url
 * @flow
 */

const { shell } = require('electron')
const fse = require('fs-extra')

const openUrl = async (filePath /*: string */) => {
  let content
  try {
    content = await fse.readFile(filePath, { encoding: 'utf-8' })

    const maybeUrl = getUrl(content)
    if (maybeUrl) {
      shell.openExternal(maybeUrl)
    }
    // TODO: handle case where no url were found
  } catch (err) {
    // TODO: handle case where content could not be read
  }
}

const getUrl = (content /*: string */) /*: ?string */ => {
  const lines = content.split('\n')

  for (const line of lines) {
    const maybeUrl = line.split('URL=')[1]
    if (maybeUrl) return maybeUrl
  }
}

module.exports = {
  openUrl
}

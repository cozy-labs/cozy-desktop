/**
 * @module gui/notes
 * @flow
 */

const { app, dialog, shell } = require('electron')

const Desktop = require('../../core/app.js')
const i18n = require('../js/i18n')
const MarkdownViewerWindow = require('../js/markdown-viewer.window.js')
const { translate } = i18n

const log = Desktop.logger({
  component: 'GUI'
})

/*::
import { App } from '../../core/app'
import { WindowBanner, WindowManager } from '../js/window_manager'
*/

const openMarkdownViewer = async (
  filename /*: string */,
  content /*: string */,
  banner /*: ?WindowBanner */ = null,
  { desktop } /*: { desktop: App } */
) /*: Promise<void> */ => {
  let viewerWindow /*: WindowManager */
  try {
    viewerWindow = new MarkdownViewerWindow(app, desktop)

    if (viewerWindow) {
      const closed = new Promise(resolve => {
        viewerWindow.once('closed', () => {
          resolve()
        })
      })

      await viewerWindow.show()
      viewerWindow.loadContent(filename, content, banner)
      await closed
    } else {
      throw new Error('could not load Markdown viewer content')
    }
  } finally {
    if (viewerWindow) viewerWindow = null
  }
}

const showGenericError = async (filePath, err) => {
  log.error('Could not display markdown content of note', {
    err,
    path: filePath,
    filePath,
    sentry: true
  })

  await dialog.showMessageBox(null, {
    type: 'error',
    message: translate('Error Unexpected error'),
    detail: `${err.name}: ${err.message}`,
    buttons: [translate('AppMenu Close')]
  })
}

const openNote = async (
  filePath /*: string */,
  { desktop } /*: { desktop: App } */
) => {
  try {
    const { noteUrl } = await desktop.findNote(filePath)
    shell.openExternal(noteUrl)
  } catch (err) {
    log.error('Could not find or open remote Note', {
      err,
      path: filePath,
      filePath,
      sentry: true
    })

    if (err.content) {
      try {
        let banner
        switch (err.code) {
          case 'CozyDocumentMissingError':
            banner = {
              level: 'error',
              title: translate('Error This note could not be found'),
              details: translate(
                "Error Check that the note still exists either on your Twake Workplace or its owner's." +
                  ' This could also mean that the note is out of sync.'
              )
            }
            break
          case 'UnreachableError':
            banner = {
              level: 'info',
              title: translate('Error Your Twake Workplace is unreachable'),
              details: translate(
                'Error Are you connected to the Internet?' +
                  ' You can nevertheless read the content of your note below in degraded mode.'
              )
            }
            break
          default:
            banner = {
              level: 'error',
              title: translate('Error Unexpected error'),
              details: `${err.name}: ${err.message}`
            }
        }
        await openMarkdownViewer(
          err.doc ? err.doc.name : filePath,
          err.content,
          banner,
          {
            desktop
          }
        )
        return true
      } catch (err) {
        await showGenericError(filePath, err)
        return false
      }
    } else {
      await showGenericError(filePath, err)
      return false
    }
  }
  return true
}

module.exports = { openNote, openMarkdownViewer }

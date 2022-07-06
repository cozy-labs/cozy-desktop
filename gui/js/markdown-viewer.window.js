/* @flow */

const path = require('path')
const { enable: enableRemoteModule } = require('@electron/remote/main')

const { buildTranslations } = require('./i18n')
const WindowManager = require('./window_manager')

/*::
import type { WindowBanner } from './window_manager'
*/

const VIEWER_SCREEN_WIDTH = 768
const VIEWER_SCREEN_HEIGHT = 570

const log = require('../../core/app').logger({
  component: 'GUI/MarkdownViewer'
})

module.exports = class MarkdownViewerWindow extends WindowManager {
  windowOptions() {
    return {
      title: 'Markdown Viewer',
      width: VIEWER_SCREEN_WIDTH,
      height: VIEWER_SCREEN_HEIGHT,
      indexPath: path.resolve(__dirname, '..', 'markdown-viewer.html')
    }
  }

  create() {
    super.create()

    enableRemoteModule(this.win.webContents)
  }

  ipcEvents() {
    return {}
  }

  hash() {
    return '#markdown-viewer'
  }

  translations() {
    return buildTranslations(['MarkdownViewer Why do I see this?'])
  }

  loadContent(
    filename /*: string */,
    content /*: string */,
    banner /*: ?WindowBanner */ = null
  ) {
    log.info({ content, banner }, 'loading note content')
    this.win.webContents.send('load-content', {
      translations: this.translations(),
      banner,
      content,
      filename
    })
  }
}

const path = require('path')

const { buildTranslations } = require('./i18n')
const WindowManager = require('./window_manager')

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

  ipcEvents() {
    return {}
  }

  hash() {
    return '#markdown-viewer'
  }

  translations() {
    return buildTranslations(['MarkdownViewer Why do I see this?'])
  }

  loadContent(filename, content, banner = null) {
    log.info({ content, banner }, 'loading note content')
    this.win.webContents.send('load-content', {
      translations: this.translations(),
      banner,
      content,
      filename
    })
  }

  on(event, handler) {
    this.win.on(event, handler)
  }
}

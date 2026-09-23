/* eslint-env mocha */
/* @flow */

/** End-to-end test of the user alerts dev page (dev/user-alerts.html).
 *
 * Loads the page in a hidden BrowserWindow, sends every sample alert through
 * the real Elm ports and checks that the expected message is rendered.
 *
 * Requires gui/elm.js and gui/app.css to be built (see the test:gui script)
 * and a display (Xvfb on CI, like the other electron-mocha suites).
 */

const path = require('path')

const { BrowserWindow } = require('electron')
const should = require('should')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// Substring expected in the rendered alert content, by alert index.
// Rendering language depends on the ?lang= param of the page (default fr),
// but here Elm falls back to the English key when the locale file is absent.
const EXPECTED = {
  '3': '« rapport?.txt »', // IncompatibleDoc — reservedChars (doc)
  '4': '« di:r »', // IncompatibleDoc — reservedChars (parent)
  '5': '« COM1.txt »', // IncompatibleDoc — reservedName (doc)
  '6': '« CON »', // IncompatibleDoc — reservedName (parent)
  '7': '« rapport. »', // IncompatibleDoc — forbiddenLastChar (doc)
  '8': '« espace »', // IncompatibleDoc — forbiddenLastChar (parent, trailing space)
  '9': '243', // IncompatibleDoc — dirNameMaxBytes (doc)
  '10': '256', // IncompatibleDoc — nameMaxBytes (doc)
  '11': '243', // IncompatibleDoc — dirNameMaxBytes (parent)
  '12': '4095', // IncompatibleDoc — pathMaxBytes
  '13': 'contient des caractères interdits ou est trop long' // IncompatibleDoc — fallback
}

describe('User alerts dev page', function() {
  this.timeout(30000)

  let win
  let alerts
  const consoleErrors = []

  before(async function() {
    win = new BrowserWindow({ show: false, width: 800, height: 600 })
    win.webContents.on('console-message', (event, level, message) => {
      if (level >= 3) consoleErrors.push(message)
    })
    await win.loadFile(
      path.join(__dirname, '..', '..', 'dev', 'user-alerts.html')
    )
    for (let i = 0; i < 50; i++) {
      alerts = await win.webContents.executeJavaScript(
        'window.ALERTS ? window.ALERTS.map(a => a.label) : null'
      )
      if (alerts) break
      await sleep(100)
    }
    should(alerts).not.be.null()
  })

  after(function() {
    if (win) win.destroy()
  })

  it('renders every alert with its expected message', async function() {
    for (let i = 0; i < alerts.length; i++) {
      const expected = EXPECTED[i]
      await win.webContents.executeJavaScript(`sendAlerts(${i})`)

      let content = ''
      for (let tries = 0; tries < 20; tries++) {
        content = await win.webContents.executeJavaScript(
          '(document.querySelector(".alert-line") || {}).innerText || ""'
        )
        if (expected == null || content.includes(expected)) break
        await sleep(300)
      }

      if (expected != null && !content.includes(expected)) {
        throw new Error(
          `[${i}] ${alerts[i]}\nexpected: ${expected}\ngot: ${content}`
        )
      }
    }
  })

  it('does not log any renderer error', function() {
    should(consoleErrors).be.empty()
  })
})

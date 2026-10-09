/* @flow */

/** Builds the HTML page served to the browser when the OIDC login performed
 * in it succeeds.
 *
 * The page is fully self-contained (styles and script are inlined) as it is
 * served by the ephemeral local HTTP server waiting for the OIDC callback and
 * displayed in the user's default browser.
 *
 * @module gui/js/login_success_page
 */

const { interpolate, locale, translate } = require('./i18n')

const AUTO_CLOSE_DELAY = 5

const escapeHtml = string =>
  string
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const buildLoginSuccessPage = () /*: string */ => {
  const lang = locale()
  const title = translate('OAuth Login successful')
  const message = translate(
    'OAuth You can now go back to the Twake Desktop application.'
  )
  const autoClose = translate(
    'OAuth This tab will close automatically in {0} seconds.'
  )
  const autoCloseFallback = translate(
    'OAuth This tab could not be closed automatically. You can close it now.'
  )

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { height: 100%; }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
          'Helvetica Neue', Arial, sans-serif;
        color: #32363f;
        background: linear-gradient(160deg, #f5f8fc 0%, #e8eff9 100%);
        -webkit-font-smoothing: antialiased;
      }
      .container { text-align: center; padding: 32px; }
      .brand {
        margin-bottom: 24px;
        font-size: 26px;
        font-weight: 700;
        letter-spacing: -0.5px;
        color: #297ef2;
      }
      .card {
        max-width: 420px;
        padding: 40px 48px;
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 8px 24px rgba(41, 126, 242, 0.1),
          0 2px 8px rgba(50, 54, 63, 0.06);
      }
      .card svg { display: block; margin: 0 auto; }
      h1 { margin: 20px 0 8px; font-size: 22px; font-weight: 600; }
      .message {
        margin-bottom: 20px;
        font-size: 15px;
        line-height: 1.5;
        color: #5f6b7a;
      }
      .auto-close { font-size: 13px; color: #98a2b3; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="brand">Twake</div>
      <main class="card">
        <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <circle cx="32" cy="32" r="32" fill="#38c949"></circle>
          <path
            fill="#ffffff"
            transform="translate(12.48 8.32) scale(1.6)"
            d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"
          ></path>
        </svg>
        <h1>${escapeHtml(title)}</h1>
        <p class="message">${escapeHtml(message)}</p>
        <p
          class="auto-close"
          id="auto-close"
          data-fallback="${escapeHtml(autoCloseFallback)}"
        >
          ${interpolate(
            escapeHtml(autoClose),
            `<span id="countdown">${AUTO_CLOSE_DELAY}</span>`
          )}
        </p>
      </main>
    </div>
    <script>
      ;(function() {
        var seconds = ${AUTO_CLOSE_DELAY}
        var note = document.getElementById('auto-close')
        var countdown = document.getElementById('countdown')
        if (!note || !countdown) return
        var timer = setInterval(function() {
          seconds -= 1
          countdown.textContent = String(Math.max(seconds, 0))
          if (seconds <= 0) {
            clearInterval(timer)
            window.close()
            setTimeout(function() {
              note.textContent = note.getAttribute('data-fallback')
            }, 500)
          }
        }, 1000)
      })()
    </script>
  </body>
</html>`
}

module.exports = {
  buildLoginSuccessPage
}

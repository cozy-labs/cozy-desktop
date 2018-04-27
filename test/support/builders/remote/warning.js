/* @flow */

import type { Warning } from '../../../../core/remote/warnings'

module.exports = {
  list (): {warnings: Warning[], err: Error} {
    const warnings = [tosUpdated()]
    const err = new Error(JSON.stringify({errors: warnings}))
    // $FlowFixMe
    err.status = 402

    return {warnings, err}
  }
}

function tosUpdated (): Warning {
  return {
    error: 'tos-updated',
    title: 'TOS Updated',
    detail: 'TOS have been updated',
    links: {
      self: 'https://manager.cozycloud.cc/cozy/tos?domain=...'
    }
  }
}

/* @flow */

import type { Warning } from '../../../../core/remote/warnings'

module.exports = {
  tosUpdated (): Warning {
    return {
      error: 'tos_updated',
      title: 'TOS Updated',
      details: 'TOS have been updated',
      links: {
        action: 'https://manager.cozycloud.cc/cozy/tos?domain=...'
      }
    }
  },

  list (): Warning[] {
    return [this.tosUpdated()]
  }
}

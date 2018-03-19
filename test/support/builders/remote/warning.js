/* @flow */

/*::
import type { Warning } from '../../../../core/remote/warning'
*/

module.exports = {
  list () /*: Warning[] */ {
    return [tosUpdated()]
  }
}

function tosUpdated () /*: Warning */ {
  return {
    error: 'tos-updated',
    title: 'TOS Updated',
    detail: 'TOS have been updated',
    links: {
      self: 'https://manager.cozycloud.cc/cozy/tos?domain=...'
    }
  }
}

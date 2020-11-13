/* @flow */

/*:: import type { Scenario } from '..' */

const nfcDir = 'Partages reçus/'
const localDir =
  process.env.COZY_DESKTOP_FS === 'HFS+' ? nfcDir.normalize('NFD') : nfcDir

module.exports = ({
  side: 'remote',
  init: [{ path: nfcDir, ino: 1 }],
  actions: [],
  expected: {
    localTree: [localDir],
    remoteTree: [nfcDir],
    trash: []
  }
} /*: Scenario */)

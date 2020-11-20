/* @flow */

/*:: import type { Scenario } from '../..' */

//const save = 'Partages reçus/'
const nfdDir = 'Impo\u0302ts Ge\u0301rard/'
const nfcFile = 'Accus\u00E9R\u00E9ception.pdf'

const localFile =
  process.env.COZY_DESKTOP_FS === 'HFS+'
    ? `${nfdDir}${nfcFile.normalize('NFD')}`
    : `${nfdDir}${nfcFile}`

module.exports = ({
  side: 'remote',
  init: [{ path: nfdDir, ino: 1 }],
  actions: [
    {
      type: 'create_file',
      path: `${nfdDir}${nfcFile}`,
      content: 'remote content'
    }
  ],
  expected: {
    localTree: [nfdDir, localFile],
    remoteTree: [nfdDir, `${nfdDir}${nfcFile}`],
    trash: []
  }
} /*: Scenario */)

/* @flow */

/*:: import type { Scenario } from '../..' */

//const save = 'Partages reçus/'
const nfdDir = 'Impo\u0302ts Ge\u0301rard/'
const nfcFile = 'Accus\u00E9R\u00E9ception.pdf'

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
    tree: [nfdDir, `${nfdDir}${nfcFile}`],
    trash: []
  }
} /*: Scenario */)

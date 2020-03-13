/* @flow */

/*:: import type { Scenario } from '../..' */

//const save = 'Partages reçus/'
const nfdDir = 'Impo\u0302ts Ge\u0301rard/'
const nfdFile = 'Accuse\u0301Re\u0301ception.pdf'

module.exports = ({
  side: 'remote',
  init: [{ path: nfdDir, ino: 1 }],
  actions: [
    {
      type: 'create_file',
      path: `${nfdDir}${nfdFile}`,
      content: 'remote content'
    }
  ],
  expected: {
    tree: [nfdDir, `${nfdDir}${nfdFile}`],
    trash: []
  }
} /*: Scenario */)

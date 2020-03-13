/* @flow */

/*:: import type { Scenario } from '..' */

//const save = 'Partages reçus/'

module.exports = ({
  side: 'remote',
  init: [{ path: 'Partages reçus/', ino: 1 }],
  actions: [],
  expected: {
    tree: ['Partages reçus/'],
    trash: []
  }
} /*: Scenario */)

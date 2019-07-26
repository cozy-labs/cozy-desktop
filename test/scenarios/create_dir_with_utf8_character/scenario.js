/* @flow */

/*:: import type { Scenario } from '..' */

//const save = 'Partages reçus/'

module.exports = ({
  actions: [{ type: 'mkdir', path: 'Partages reçus' }],
  expected: {
    tree: ['Partages reçus/'],
    remoteTrash: []
  }
} /*: Scenario */)

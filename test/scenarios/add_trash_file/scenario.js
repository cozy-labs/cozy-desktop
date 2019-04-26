/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  actions: [
    { type: 'create_file', path: 'file' },
    { type: 'wait', ms: 1500 },
    { type: 'trash', path: 'file' }
  ],
  expected: {
    tree: [],
    remoteTrash: []
  }
} /*: Scenario */)

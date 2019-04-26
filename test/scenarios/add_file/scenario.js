/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  actions: [{ type: 'create_file', path: 'file' }],
  expected: {
    tree: ['file'],
    remoteTrash: []
  }
} /*: Scenario */)

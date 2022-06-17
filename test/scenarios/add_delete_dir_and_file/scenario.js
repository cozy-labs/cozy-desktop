/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  useCaptures: false,
  actions: [
    { type: 'mkdir', path: 'dir' },
    { type: 'create_file', path: 'file' },
    { type: 'wait', ms: 1500 },
    { type: 'delete', path: 'dir' },
    { type: 'delete', path: 'file' }
  ],
  expected: {
    tree: [],
    trash: []
  }
} /*: Scenario */)

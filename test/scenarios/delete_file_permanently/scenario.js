/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [{ ino: 1, path: 'foo' }],
  actions: [{ type: 'delete', path: 'foo' }],
  expected: {
    tree: [],
    trash: ['foo']
  }
} /*: Scenario */)

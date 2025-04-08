/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  init: [
    { ino: 1, path: 'foo' },
    { ino: 2, path: 'bar' } // XXX: needed because we prevent emptying the Cozy with Desktop stopped
  ],
  actions: [{ type: 'delete', path: 'foo' }],
  expected: {
    tree: ['bar'],
    trash: ['foo']
  }
} /*: Scenario */)

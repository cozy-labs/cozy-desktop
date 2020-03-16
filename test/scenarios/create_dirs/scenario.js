/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  actions: [{ type: 'mkdir', path: 'foo' }, { type: 'mkdir', path: 'foo/bar' }],
  expected: {
    tree: ['foo/', 'foo/bar/'],
    trash: []
  }
} /*: Scenario */)

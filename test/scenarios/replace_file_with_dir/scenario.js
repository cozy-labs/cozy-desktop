/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  disabled: "We don't know how to handle it yet.",
  init: [{ ino: 1, path: 'foo' }],
  actions: [{ type: 'delete', path: 'foo' }, { type: 'mkdir', path: 'foo' }],
  expected: {
    tree: ['foo/'],
    remoteTrash: ['foo']
  }
} /*: Scenario */)

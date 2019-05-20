/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  disabled: "We don't know how to handle it yet.",
  init: [{ ino: 1, path: 'foo/' }],
  actions: [
    { type: 'delete', path: 'foo' },
    { type: 'create_file', path: 'foo' }
  ],
  expected: {
    tree: ['foo'],
    remoteTrash: []
  }
} /*: Scenario */)

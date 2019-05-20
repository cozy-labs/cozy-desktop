/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  disabled: "Not sure why we don't handle this one...",
  init: [{ ino: 1, path: 'foo' }],
  actions: [{ type: 'delete', path: 'foo' }],
  expected: {
    tree: [],
    remoteTrash: ['foo']
  }
} /*: Scenario */)

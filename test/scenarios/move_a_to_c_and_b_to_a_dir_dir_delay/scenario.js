/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  disabled: {
    stopped: 'Does not work with AtomWatcher yet.',
    remote: 'Does not work with AtomWatcher yet.'
  },
  init: [
    { ino: 1, path: 'a/' },
    { ino: 2, path: 'a/file-a' },
    { ino: 3, path: 'b/' },
    { ino: 4, path: 'b/file-b' }
  ],
  actions: [
    { type: 'mv', src: 'a', dst: 'c' },
    { type: 'wait', ms: 1500 },
    { type: 'mv', src: 'b', dst: 'a' }
  ],
  expected: {
    tree: ['a/', 'a/file-b', 'c/', 'c/file-a']
  }
} /*: Scenario */)

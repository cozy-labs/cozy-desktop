/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  useCaptures: false,
  init: [
    { ino: 1, path: 'dir/' },
    { ino: 2, path: 'dir/file' }
  ],
  actions: [
    { type: 'mv', src: 'dir/file', dst: 'file' },
    { type: 'trash', path: 'dir' }
  ],
  expected: {
    tree: ['file'],
    trash: ['dir/']
  }
} /*: Scenario */)

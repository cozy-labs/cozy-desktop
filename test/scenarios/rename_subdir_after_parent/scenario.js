/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  side: 'local',
  init: [
    { ino: 1, path: 'parent/' },
    { ino: 2, path: 'parent/subdir/' },
    { ino: 3, path: 'parent/subdir/subsubdir/' }
  ],
  actions: [
    { type: 'mv', src: 'parent', dst: 'parent-2' },
    { type: 'wait', ms: 1500 },
    { type: 'mv', src: 'parent-2/subdir', dst: 'parent-2/subdir-2' },
    { type: 'wait', ms: 1500 },
    {
      type: 'mv',
      src: 'parent-2/subdir-2/subsubdir',
      dst: 'parent-2/subdir-2/subsubdir-2'
    }
  ],
  expected: {
    tree: ['parent-2/', 'parent-2/subdir-2/', 'parent-2/subdir-2/subsubdir-2/'],
    trash: []
  }
} /*: Scenario */)

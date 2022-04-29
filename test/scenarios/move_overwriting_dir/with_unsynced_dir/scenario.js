/* @flow */

/*:: import type { Scenario } from '../..' */

module.exports = ({
  side: 'local',
  useCaptures: false,
  init: [
    { ino: 1, path: 'dir/' },
    { ino: 2, path: 'dir/overwritten', content: 'overwritten content' }
  ],
  actions: [
    {
      type: 'mkdir',
      path: 'overwriting/'
    },
    { type: 'wait', ms: 1000 },
    {
      type: 'create_file',
      path: 'overwriting/overwritten',
      content: 'overwriting content'
    },
    { type: 'create_file', path: 'overwriting/file', content: 'file content' },
    { type: 'wait', ms: 1000 },
    { type: 'mv', force: true, src: 'overwriting/', dst: 'dir/' },
    { type: 'wait', ms: 1000 }
  ],
  expected: {
    tree: ['dir/', 'dir/file', 'dir/overwritten'],
    trash: [],
    contents: {
      'dir/file': 'file content',
      'dir/overwritten': 'overwriting content'
    }
  }
} /*: Scenario */)

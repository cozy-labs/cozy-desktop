/* @flow */

/*:: import type { Scenario } from '../..' */

module.exports = ({
  side: 'local',
  useCaptures: false,
  init: [{ ino: 1, path: 'file', content: 'overwritten content' }],
  actions: [
    {
      type: 'create_file',
      path: 'overwriting',
      content: 'overwriting content'
    },
    { type: 'wait', ms: 1000 },
    { type: 'mv', src: 'overwriting', dst: 'file' },
    { type: 'wait', ms: 1000 }
  ],
  expected: {
    tree: ['file'],
    trash: [],
    contents: {
      file: 'overwriting content'
    }
  }
} /*: Scenario */)

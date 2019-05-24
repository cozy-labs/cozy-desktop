/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  side: 'local',
  init: [{ ino: 1, path: 'file', content: 'initial content' }],
  actions: [
    { type: 'delete', path: 'file' },
    { type: 'create_file', path: 'file' }
  ],
  expected: {
    tree: ['file'],
    remoteTrash: [],
    contents: {
      file: 'whatever'
    }
  }
} /*: Scenario */)

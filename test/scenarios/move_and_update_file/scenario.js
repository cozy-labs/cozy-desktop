/* @flow */

const { runOnHFS } = require('../../support/helpers/scenarios')

/*:: import type { Scenario } from '..' */

module.exports = ({
  useCaptures: false,
  init: [
    { ino: 1, path: 'dst/' },
    { ino: 2, path: 'src/' },
    { ino: 3, path: 'src/file', content: 'initial content' }
  ],
  actions: [
    { type: 'wait', ms: runOnHFS() ? 1000 : 500 },
    { type: 'mv', src: 'src/file', dst: 'dst/file' },
    { type: 'update_file', path: 'dst/file', content: 'updated content' },
    { type: 'wait', ms: 1000 }
  ],
  expected: {
    tree: ['dst/', 'dst/file', 'src/'],
    trash: [],
    contents: {
      'dst/file': 'updated content'
    }
  }
} /*: Scenario */)

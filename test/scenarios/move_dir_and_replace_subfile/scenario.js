/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  disabled: {
    // FIXME: Only work on macOS with STOPPED_CLIENT.
    'local/darwin': 'Generates conflicts',
    remote: 'Broken on macOS only?'
  },
  init: [
    { ino: 1, path: 'src/' },
    { ino: 2, path: 'src/file', content: 'initial content' }
  ],
  actions: [
    { type: 'mv', src: 'src', dst: 'dst' },
    { type: 'wait', ms: 1500 },
    { type: 'create_file', path: 'dst/file.tmp', content: 'new content' },
    { type: 'trash', path: 'dst/file' },
    { type: 'mv', src: 'dst/file.tmp', dst: 'dst/file' }
  ],
  expected: {
    tree: ['dst/', 'dst/file'],
    // FIXME: old file will end up in the trash with chokidar, not with atom.
    trash: [],
    contents: {
      'dst/file': 'new content'
    }
  }
} /*: Scenario */)

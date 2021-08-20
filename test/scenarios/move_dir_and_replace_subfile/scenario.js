/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  useCaptures: false,
  init: [
    { ino: 1, path: 'src/' },
    { ino: 2, path: 'src/file', content: 'initial content' }
  ],
  actions: [
    { type: 'mv', src: 'src', dst: 'dst' },
    { type: 'wait', ms: 1500 },
    { type: 'create_file', path: 'dst/file.tmp', content: 'new content' },
    { type: 'trash', path: 'dst/file' },
    { type: 'mv', src: 'dst/file.tmp', dst: 'dst/file' },
    { type: 'wait', ms: 1000 }
  ],
  expected: {
    tree: ['dst/', 'dst/file'],
    // the remote changes are fetched together and the trashing merged first so
    // the file is not moved and thus we don't register an overwriting update of
    // file leading to the trashing being propagated.
    localTrash: ['file'],
    remoteTrash: [],
    contents: {
      'dst/file': 'new content'
    }
  }
} /*: Scenario */)

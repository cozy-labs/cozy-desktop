/* @flow */

const { runWithStoppedClient } = require('../../support/helpers/scenarios')

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
    // The remote changes are fetched together and the trashing merged first so
    // file is not moved and thus we don't register an overwriting update of
    // file leading to the trashing being propagated.
    localTrash: ['file'],
    // During an initial scan on macOS, the generated delete changes are
    // prepended to the list of changes so file is seen as deleted, not moved,
    // and thus we don't register an overwriting update of file leading to the
    // trashing being propagated.
    remoteTrash:
      process.platform === 'darwin' && runWithStoppedClient() ? ['file'] : [],
    contents: {
      'dst/file': 'new content'
    }
  }
} /*: Scenario */)

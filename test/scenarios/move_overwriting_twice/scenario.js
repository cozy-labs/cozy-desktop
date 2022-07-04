/* @flow */

const { runOnHFS } = require('../../support/helpers/scenarios')

/*:: import type { Scenario } from '..' */

module.exports = ({
  useCaptures: false,
  disabled:
    'Not possible until we can propagate multiple overwrites on the same path (e.g. make `overwrite` an array) or decide not to keep overwritten references anymore',
  init: [
    { ino: 1, path: 'overwriting-1', content: 'replacing content 1' },
    { ino: 2, path: 'overwriting-2', content: 'replacing content 2' },
    { ino: 3, path: 'overwritten', content: 'replaced content' }
  ],
  actions: [
    { type: 'wait', ms: runOnHFS() ? 1000 : 0 },
    { type: 'mv', src: 'overwriting-1', dst: 'overwritten' },
    { type: 'wait', ms: 500 },
    { type: 'mv', src: 'overwriting-2', dst: 'overwritten' },
    { type: 'wait', ms: 1000 }
  ],
  expected: {
    tree: ['overwritten'],
    trash: ['overwriting-1', 'overwritten'],
    contents: {
      overwritten: 'replacing content 2'
    }
  }
} /*: Scenario */)

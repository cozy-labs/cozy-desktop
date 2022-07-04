/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  actions: [
    { type: 'mkdir', path: 'dir' },
    { type: 'wait', ms: 1500 },
    { type: 'trash', path: 'dir' },
    { type: 'wait', ms: 1500 }
  ],
  expected: {
    tree: [],
    trash: []
  }
} /*: Scenario */)

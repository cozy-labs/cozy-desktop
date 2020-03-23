/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  useCaptures: false,
  init: [
    { ino: 1, path: 'file.txt', content: 'initial content' },
    { ino: 2, path: '2019', content: 'initial content' },
    { ino: 3, path: '2020/' }
  ],
  actions: [
    { type: 'delete', path: 'file.txt' },
    { type: 'delete', path: '2019' },
    { type: 'delete', path: '2020' },
    { type: 'create_file', path: 'file.txt', content: 'updated content' },
    { type: 'mkdir', path: '2019' },
    { type: 'create_file', path: '2020', content: 'updated content' },
    { type: 'wait', ms: 1500 }
  ],
  expected: {
    tree: ['2019/', '2020', 'file.txt'],
    trash: ['2019'],
    contents: {
      'file.txt': 'updated content',
      '2020': 'updated content'
    }
  }
} /*: Scenario */)

/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  useCaptures: false,
  disabled: {
    'local/darwin':
      'cannot work as fsevents fires an add event for Dir/renamed-child last and we end up considrering this is yet another move. We need to figure out a way to get these events in order'
  },
  init: [],
  actions: [
    { type: 'mkdir', path: 'dir' },
    { type: 'create_file', path: 'dir/child', content: 'child content' },
    {
      type: 'create_file',
      path: 'dir/renamed-child',
      content: 'renamed-child content'
    },
    {
      type: 'create_file',
      path: 'dir/moved-child',
      content: 'moved-child content'
    },
    { type: 'create_file', path: 'file', content: 'file content' },
    {
      type: 'create_file',
      path: 'moved-file',
      content: 'moved-file content'
    },
    { type: 'wait', ms: 1000 },
    { type: 'mv', src: 'dir', dst: 'Dir' },
    { type: 'wait', ms: 1000 },
    { type: 'mv', src: 'Dir/renamed-child', dst: 'Dir/Renamed-Child' },
    {
      type: 'mv',
      src: 'Dir/moved-child',
      dst: 'Moved-child'
    },
    { type: 'mv', src: 'file', dst: 'File' },
    { type: 'mv', src: 'moved-file', dst: 'Dir/moved-file' },
    { type: 'wait', ms: 1000 }
  ],
  expected: {
    tree: [
      'Dir/',
      'Dir/Renamed-Child',
      'Dir/child',
      'Dir/moved-file',
      'File',
      'Moved-child'
    ],
    trash: []
  }
} /*: Scenario */)

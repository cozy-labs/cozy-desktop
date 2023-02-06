/* @flow */

/*:: import type { Scenario } from '..' */

module.exports = ({
  useCaptures: false,
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
    { type: 'wait', ms: 500 },
    { type: 'mv', src: 'dir', dst: 'Dir' },
    { type: 'wait', ms: 500 },
    { type: 'mv', src: 'Dir/renamed-child', dst: 'Dir/Renamed-Child' },
    {
      type: 'mv',
      src: 'Dir/moved-child',
      dst: 'Moved-child'
    },
    { type: 'mv', src: 'file', dst: 'File' },
    { type: 'mv', src: 'moved-file', dst: 'Dir/moved-file' },
    { type: 'wait', ms: 500 },
    { type: 'trash', path: 'Dir' },
    { type: 'trash', path: 'File' },
    { type: 'trash', path: 'Moved-child' },
    { type: 'wait', ms: 500 }
  ],
  expected: {
    tree: [],
    trash: []
  }
} /*: Scenario */)

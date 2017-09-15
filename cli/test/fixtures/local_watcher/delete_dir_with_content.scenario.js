module.exports = {
  init: [
    'parent/',
    'parent/dir/',
    'parent/dir/empty-subdir/',
    'parent/dir/subdir/',
    'parent/dir/subdir/file',
    'parent/other_dir/',
  ],
  actions: [
    {type: "rm", path: "parent/dir"},
  ],
}

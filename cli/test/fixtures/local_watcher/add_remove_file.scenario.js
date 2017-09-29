module.exports = {
  actions: [
    {type: ">", path: "file"},
    {type: "wait", ms: 1500},
    {type: "rm", path: "file"},
  ],
  expected: {
    prepCalls: [
    ],
  },
}

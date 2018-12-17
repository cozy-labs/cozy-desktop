#!/usr/bin/env node
// This script convert a log file made by cozy-desktop to a file that can be
// used with gource to visualize it.
//
// Gource: https://gource.io/
//
// To use it, first install Gource, then:
//
//     $ ./dev/log2gource.js < desktop.log > gource.log
//     $ gource --seconds-per-day 60 gource.log
//
// Gource has a pipe ('|') delimited custom log format:
//     timestamp - A unix timestamp of when the update occured.
//     username  - The name of the user who made the update.
//     type      - initial for the update type - (A)dded, (M)odified or (D)eleted.
//     file      - Path of the file updated.
//     colour    - A colour for the file in hex (FFFFFF) format. Optional.
//
// TODO we may use the red colour to highlight the conflicts

const readline = require('readline')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
})
rl.on('line', line => {
  const data = JSON.parse(line)
  const ts = +new Date(data.time)
  const path = data.path

  if (data.component === 'ChokidarWatcher') {
    if (data.msg === 'FileAddition' || data.msg === 'DirAddition') {
      console.log(`${ts}|Local|A|${path}`)
    } else if (data.msg === 'FileMove' || data.msg === 'DirMove') {
      console.log(`${ts}|Local|D|${data.oldpath}`)
      console.log(`${ts}|Local|A|${path}`)
    } else if (data.msg === 'FileDeletion' || data.msg === 'DirDeletion') {
      console.log(`${ts}|Local|D|${path}`)
    } else if (data.msg === 'FileUpdate') {
      console.log(`${ts}|Local|M|${path}`)
    }
  }

  if (data.component === 'RemoteWatcher') {
    if (data.msg === 'FileAddition' || data.msg === 'DirAddition') {
      console.log(`${ts}|Remote|A|${path}`)
    } else if (data.msg === 'FileMove' || data.msg === 'DirMove') {
      console.log(`${ts}|Remote|D|${data.oldpath}`)
      console.log(`${ts}|Remote|A|${path}`)
    } else if (data.msg === 'FileTrashing' || data.msg === 'DirTrashing') {
      console.log(`${ts}|Remote|D|${path}`)
    } else if (data.msg === 'FileUpdate') {
      console.log(`${ts}|Remote|M|${path}`)
    }
  }
})

#!/usr/bin/env node

const fs = require('fs')

function fixFile (file, bad, good) {
  if (fs.existsSync(file)) {
    console.log('Fixing ' + file + ' ...')
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(bad, good))
  }
}

// electron-builder uses the app/package.name instead of .productName to
// generate the latest.yml and latest-mac.json files, so they don't match the
// built artifacts by default.
//
// And GitHub will replaces spaces with dots in uploaded release artifacts.

fixFile('dist/latest.yml', 'cozy-desktop-gui-setup-', 'Cozy.Desktop.Setup.')
fixFile('dist/github/latest-mac.json', 'cozy-desktop-gui', 'Cozy.Desktop')


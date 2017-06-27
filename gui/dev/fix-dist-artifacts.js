const fs = require('fs')
const yaml = require('js-yaml')

function fixLatestYml (yamlPath, bad, good, opts={}) {
  if (fs.existsSync(yamlPath)) {
    const goodYaml = fs.readFileSync(yamlPath, 'utf8').replace(bad, good)

    console.log(`Fixing ${yamlPath} ...`)
    fs.writeFileSync(yamlPath, goodYaml)

    if (opts.generateLegacyJson) {
      const jsonPath = yamlPath.replace(/\.yml/, '.json')
      const {version, releaseDate} = yaml.safeLoad(goodYaml)
      const url = `https://github.com/cozy-labs/cozy-desktop/releases/download/v${version}/Cozy.Drive-${version}-mac.zip`
      const goodJson = JSON.stringify({version, releaseDate, url}, null, 2)

      console.log(`Fixing ${jsonPath} ...`)
      fs.writeFileSync(jsonPath, goodJson)
    }
  }
}

// electron-builder uses the app/package.name instead of .productName to
// generate the latest.yml and latest-mac.json files, so they don't match the
// built artifacts by default.
//
// And GitHub will replaces spaces with dots in uploaded release artifacts.

fixLatestYml('dist/latest.yml', 'cozy-desktop-gui-setup-', 'Cozy.Drive.Setup.')
fixLatestYml('dist/latest-mac.yml', 'cozy-desktop-gui', 'Cozy.Drive', {generateLegacyJson: true})


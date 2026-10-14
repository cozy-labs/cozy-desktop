// Guard against a `win.publisherName` drifting from the certificate that
// actually signs the installer: electron-updater only checks the downloaded
// installer's signature against the `publisherName` recorded in the
// installed app's `app-update.yml`, so a stale value blocks every
// auto-update after release (2026 regression, undetected for 7 months).
//
// Matching semantics mirror electron-updater's
// `windowsExecutableCodeSignatureVerifier.js` (via `parseDn`): a full DN
// entry matches when all its keys match the subject, a bare entry is
// compared to the certificate CN only (exact case).

// Same `parseDn` flavor as electron-updater's own (transitive) dependency,
// so the guard and the client compare DNs identically.
// eslint-disable-next-line node/no-extraneous-require
const { parseDn } = require('builder-util-runtime')

const matchesPublisher = (subject, publisherNames) => {
  const parsedSubject = parseDn(subject)
  return publisherNames.some(name => {
    const dn = parseDn(name)
    if (dn.size) {
      return Array.from(dn.keys()).every(
        key => dn.get(key) === parsedSubject.get(key)
      )
    }
    return name === parsedSubject.get('CN')
  })
}

module.exports = { matchesPublisher }

if (require.main === module) {
  const subject = process.argv[2]
  if (!subject) {
    // eslint-disable-next-line no-console
    console.error('Usage: node verify-publisher.js "<certificate subject DN>"')
    process.exit(2) // eslint-disable-line no-process-exit
  }

  const publisherNames = [].concat(
    require('../../electron-builder-config.js').win.publisherName
  )

  if (matchesPublisher(subject, publisherNames)) {
    // eslint-disable-next-line no-console
    console.log(`Installer signed by an allowed publisher: ${subject}`)
  } else {
    // eslint-disable-next-line no-console
    console.error(
      `Installer signed with an unexpected certificate.\n` +
        `  Subject: ${subject}\n` +
        `  Expected one of: ${JSON.stringify(publisherNames)}`
    )
    process.exit(1) // eslint-disable-line no-process-exit
  }
}

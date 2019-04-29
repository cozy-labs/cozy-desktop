const { translate, interpolate, platformName } = require('./i18n')

module.exports.incompatibilitiesErrorMessage = i => {
  const reasons = []
  const docType = translate(`Helpers ${i.docType}`)
  if (i.reservedChars) {
    reasons.push(
      interpolate(
        translate('Error {0} names cannot include characters {1}'),
        docType,
        Array.from(i.reservedChars).join(' ')
      )
    )
  }
  if (i.reservedName) {
    reasons.push(
      interpolate(translate('Error the “{0}” name is reserved'), i.reservedName)
    )
  }
  if (i.forbiddenLastChar) {
    reasons.push(
      interpolate(
        translate('Error {0} names cannot end with character {1}'),
        docType,
        i.forbiddenLastChar
      )
    )
  }
  if (i.pathMaxBytes) {
    reasons.push(
      interpolate(translate('Error it exceeds the path size limit'), docType)
    )
  }
  if (i.nameMaxBytes) {
    reasons.push(
      interpolate(translate('Error it exceeds the name size limit'), docType)
    )
  }
  if (i.dirNameMaxBytes) {
    reasons.push(
      interpolate(
        translate('Error it exceeds the folder name size limit'),
        docType
      )
    )
  }
  return (
    interpolate(
      translate(
        'Error The “{0}” {1} cannot be synchronized locally because ' +
          '{2} on the {3} system.'
      ),
      i.name,
      docType,
      reasons.join(` ${translate('Helpers and')} `),
      platformName()
    ) +
    '\n\n' +
    translate('Error You should rename it in your Cozy.')
  )
}

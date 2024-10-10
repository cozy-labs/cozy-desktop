/* eslint-disable no-useless-escape */
'use strict'

exports.default = async function (configuration) {
  if (process.env.SIGN_CODE !== 'True') {
    // eslint-disable-next-line no-console
    console.log('Skipping code signing')
    return
  }

  const { execSync } = require('child_process')

  const whoami = 'customSign.js'

  if (!process.env.SM_INSTALL_DIR) {
    throw `Unable to sign files because the path to smctl.exe is not set in the environment.`
  }
  if (!process.env.SIGNTOOL_DIR) {
    throw `Unable to sign files because the path to signtool.exe is not set in the environment.`
  }

  // Common
  const filePath = `"${configuration.path.replace(/\\/g, '/')}"`
  const smctlDir = `"${process.env.SM_INSTALL_DIR}"`
  const signToolDir = `"${process.env.SIGNTOOL_DIR}"`

  try {
    const signCommand = `.\\build\\windows\\sign.ps1`
    const keyPairAlias = `"${process.env.SM_KEYPAIR_ALIAS}"`
    const sign = [
      `pwsh`,
      `-NoProfile`,
      `-ExecutionPolicy Unrestricted`,
      `-Command \"$Input | ${signCommand}`,
      `-FilePath '${filePath}'`,
      `-KeyPairAlias '${keyPairAlias}'`,
      `-SmctlDir '${smctlDir}'`,
      `-SignToolDir '${signToolDir}'\"`
    ]
    const signStdout = execSync(sign.join(' ')).toString()
    if (signStdout.match(/FAILED/)) {
      // eslint-disable-next-line no-console
      console.error(
        `[${whoami}] Error detected in ${signCommand}: [${signStdout}]`
      )
      throw `Error detected in ${signCommand}: [${signStdout}]`
    }
  } catch (e) {
    throw `Exception thrown during code signing: ${e.message}`
  }

  // Verify the signature
  try {
    const verifyCommand = `.\\build\\windows\\verify.ps1`
    const fingerprint = `"${process.env.SM_CERTIFICATE_FINGERPRINT}"`
    const verify = [
      `pwsh`,
      `-NoProfile`,
      `-ExecutionPolicy Unrestricted`,
      `-Command \"$Input | ${verifyCommand}`,
      `-FilePath '${filePath}'`,
      `-Fingerprint '${fingerprint}'`,
      `-SmctlDir '${smctlDir}'`,
      `-SignToolDir '${signToolDir}'\"`
    ]
    const verifyStdout = execSync(verify.join(' ')).toString()
    if (verifyStdout.match(/FAILED/)) {
      // eslint-disable-next-line no-console
      console.error(
        `[${whoami}] Error detected in ${verifyCommand}: [${verifyStdout}]`
      )
      throw `Error detected in ${verifyCommand}: [${verifyStdout}]`
    }
  } catch (e) {
    throw `Exception thrown during signature verification: ${e.message}`
  }
}

'use strict'

// Sign and verify a packaged file with the DigiCert KeyLocker CLI (smctl).
//
// The spawned scripts end with `exit $LASTEXITCODE` so that the exit code of
// smctl propagates: pwsh does not do it through `-Command` (which the previous
// implementation relied on), and the output was only grepped for a hard-coded
// "FAILED" string that never matches the actual smctl error format
// (`level="error" msg="..."`), hiding signing failures from the build.
// Nothing is captured anymore: the scripts inherit stdio so that the smctl
// output stays visible in the CI logs.
exports.default = async function(configuration) {
  if (process.env.SIGN_CODE !== 'True') {
    // eslint-disable-next-line no-console
    console.log('Skipping code signing')
    return
  }

  const { spawnSync } = require('child_process')
  const path = require('path')

  const whoami = 'customSign.js'

  if (!process.env.SM_INSTALL_DIR) {
    throw `Unable to sign files because the path to smctl.exe is not set in the environment.`
  }
  if (!process.env.SIGNTOOL_DIR) {
    throw `Unable to sign files because the path to signtool.exe is not set in the environment.`
  }
  if (!process.env.SM_KEYPAIR_ALIAS) {
    throw `Unable to sign files because the keypair alias (SM_KEYPAIR_ALIAS) is not set in the environment.`
  }

  // Runs one of the build/windows/*.ps1 scripts with the common arguments
  // passed as proper argv entries instead of quoting paths into a `pwsh
  // -Command` string.
  const runScript = (name, args, step) => {
    const { status, error } = spawnSync(
      'pwsh',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Unrestricted',
        '-File',
        path.join(__dirname, name),
        ...args,
        '-SmctlDir',
        process.env.SM_INSTALL_DIR,
        '-SignToolDir',
        process.env.SIGNTOOL_DIR
      ],
      { stdio: 'inherit' }
    )

    if (error != null) {
      throw `[${whoami}] Exception thrown during ${step}: ${error.message}`
    }
    if (status !== 0) {
      throw `[${whoami}] ${step} failed with exit code ${status} (see the pwsh output above).`
    }
  }

  runScript(
    'sign.ps1',
    ['-FilePath', configuration.path, '-KeyPairAlias', process.env.SM_KEYPAIR_ALIAS],
    'code signing'
  )
  runScript('verify.ps1', ['-FilePath', configuration.path], 'signature verification')
}

installedCheck = require 'installed-check'

maybeErrorMessage = (result) ->
    if result.errors.length
        """\n
        =====================================================================
        Packages installed in ./node_modules/ don't match package.json:

        #{("- #{error}" for error in result.errors).join "\n"}

        =====================================================================
        """

module.exports = (done) ->
    installedCheck()
        .then (result) -> done(maybeErrorMessage(result))
        .catch done
    return


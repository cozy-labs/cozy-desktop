mm = require 'micromatch'

# Cozy-desktop can ignore some files and folders from a list of patterns in the
# cozyignore file. This class can be used to know if a file/folder is ignored.
#
# See https://git-scm.com/docs/gitignore/#_pattern_format
class Ignore

    # See https://github.com/jonschlinkert/micromatch#options
    MicromatchOptions =
        noextglob: true

    # Load patterns for detecting ignored files and folders
    constructor: (lines) ->
        @patterns = []
        for line in lines
            continue if line is ''          # Blank line
            continue if line[0] is '#'      # Comments
            line = line.replace /\s*$/, ''  # Remove trailing spaces
            if line[line.length-1] is '/'   # Detect trailing slash
                line = line.slice 0, line.length-1
                folder = true
            else
                folder = false
            pattern =
                match: mm.matcher line, MicromatchOptions
                folder: folder
            @patterns.push pattern

    # Return true if the file or folder with the given path should be ignored
    #
    # kind is 'file' or 'folder'
    # (a pattern with a trailing slash is only for folders)
    isIgnored: (path, kind) ->
        for pattern in @patterns
            if kind is 'folder' or not pattern.folder
                return true if pattern.match path
        return false


module.exports = Ignore

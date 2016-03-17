{basename,dirname} = require('path')
matcher            = require('micromatch').matcher

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
            folder   = false
            fullpath = false
            noslash  = line.indexOf('/') is -1
            line = line.replace /\s*$/, ''  # Remove trailing spaces
            if line[0] is '/'               # Detect leading slash
                line = line.slice 1
                fullpath = true
            if line[line.length-1] is '/'   # Detect trailing slash
                line = line.slice 0, line.length-1
                folder = true
            pattern =
                match: matcher line, MicromatchOptions
                folder:   folder    # The pattern will only match a folder
                fullpath: fullpath  # The pattern will only match the full path
                basename: noslash   # The pattern can match only the basename
            @patterns.push pattern

    # Return true if the doc matches the pattern
    match: (path, isFolder, pattern) ->
        if pattern.basename
            return true if pattern.match basename path
        if isFolder or not pattern.folder
            return true  if pattern.match path
        return false if pattern.fullpath
        parent = dirname path
        return false if parent is '.'
        return @match parent, true, pattern

    # Return true if the given file/folder path should be ignored
    isIgnored: (doc) ->
        ignored = false
        for pattern in @patterns
            ignored or= @match doc._id, doc.docType is 'folder', pattern
        return ignored


module.exports = Ignore

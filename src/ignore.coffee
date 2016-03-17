{basename,dirname} = require('path')
matcher            = require('micromatch').matcher

# Cozy-desktop can ignore some files and folders from a list of patterns in the
# cozyignore file. This class can be used to know if a file/folder is ignored.
#
# See https://git-scm.com/docs/gitignore/#_pattern_format
class Ignore

    # See https://github.com/github/gitignore/tree/master/Global
    DefaultRules = [
        # Dropbox
        '.dropbox'
        '.dropbox.attr'
        '.dropbox.cache'

        # Eclipse, SublimeText and many others
        '*.tmp'
        '*.bak'

        # Emacs
        '*~'
        '\\#*\\#'

        # LibreOffice
        '.~lock.*#'

        # Linux
        '.fuse_hidden*'
        '.Trash-*'

        # Microsoft Office
        '~$*.{doc,xls,ppt}*'

        # OSX
        '.DS_Store'
        '.DocumentRevisions-V100'
        '.fseventsd'
        '.Spotlight-V100'
        '.TemporaryItems'
        '.Trashes'
        '.VolumeIcon.icns'

        # Vim
        '*.sw[px]'

        # Windows
        'Thumbs.db'
        'ehthumbs.db'
    ]

    # See https://github.com/jonschlinkert/micromatch#options
    MicromatchOptions =
        noextglob: true

    # Load patterns for detecting ignored files and folders
    constructor: (lines) ->
        @patterns = []
        for line in lines
            continue if line is ''          # Blank line
            continue if line[0] is '#'      # Comments
            @patterns.push @buildPattern line

    # Parse a line and build the corresponding pattern
    buildPattern: (line) ->
        folder   = false
        negate   = false
        noslash  = line.indexOf('/') is -1
        if line.indexOf('**') isnt -1   # Detect two asterisks
            fullpath = true
            noslash  = false
        if line[0] is '!'               # Detect bang prefix
            line = line.slice 1
            negate = true
        if line[0] is '/'               # Detect leading slash
            line = line.slice 1
        if line[line.length-1] is '/'   # Detect trailing slash
            line = line.slice 0, line.length-1
            folder = true
        line = line.replace /^\\/, ''   # Remove leading escaping char
        line = line.replace /\s*$/, ''  # Remove trailing spaces
        pattern =
            match: matcher line, MicromatchOptions
            basename: noslash   # The pattern can match only the basename
            folder:   folder    # The pattern will only match a folder
            negate:   negate    # The pattern is negated
        return pattern

    # Add some rules for things that should be always ignored (temporary
    # files, thumbnails db, trash, etc.)
    addDefaultRules: ->
        morePatterns = (@buildPattern rule for rule in DefaultRules)
        @patterns = morePatterns.concat @patterns
        return @

    # Return true if the doc matches the pattern
    match: (path, isFolder, pattern) ->
        if pattern.basename
            return true if pattern.match basename path
        if isFolder or not pattern.folder
            return true  if pattern.match path
        parent = dirname path
        return false if parent is '.'
        return @match parent, true, pattern

    # Return true if the given file/folder path should be ignored
    isIgnored: (doc) ->
        result = false
        for pattern in @patterns
            if pattern.negate
                result and= not @match doc._id, doc.docType is 'folder', pattern
            else
                result or= @match doc._id, doc.docType is 'folder', pattern
        return result


module.exports = Ignore

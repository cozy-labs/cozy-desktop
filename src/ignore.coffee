# Cozy-desktop can ignore some files and folders from a list of patterns in the
# cozyignore file. This class can be used to know if a file/folder is ignored.
#
# See https://git-scm.com/docs/gitignore/#_pattern_format
class Ignore

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
                description: line
                folder: folder
            @patterns.push pattern

    # Returns true if the pattern match the give file/folder
    match: (pattern, path, kind) ->
        # If the rule is only for folders and it's not a folder,
        # it can't be a match
        return false if pattern.folder and kind isnt 'folder'
        # Else, check if the path match the pattern description
        return path is pattern.description

    # Return true if the file or folder with the given path should be ignored
    #
    # kind is 'file' or 'folder'
    # (a pattern with a trailing slash is only for folders)
    isIgnored: (path, kind) ->
        for pattern in @patterns
            return true if @match pattern, path, kind
        return false


module.exports = Ignore

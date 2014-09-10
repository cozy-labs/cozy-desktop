File = require '../models/file'
Helpers = require '../lib/folder_helpers'

# the uploadQueue is a mix of async.queue & BackoneCollection
# blobs are added to the queue & to the collection
# on upload success, File Models are marked as loaded
# on

module.exports = class UploadQueue extends Backbone.Collection

    # number of files actually loaded
    loaded: 0

    # list of paths where files are being uploaded
    uploadingPaths: {}

    initialize: ->
        @asyncQueue = async.queue @uploadWorker, 5

        # when a model is added, we queue it for upload
        @listenTo this, 'add', (model) =>
            @completed = false
            # Files at the bottom, Folder at the top
            if model.get('type') is 'file' then @asyncQueue.push model
            else if model.get('type') is 'folder' then @asyncQueue.unshift model
            else throw new Error('adding wrong typed model to upload queue')

        # never happens, but should be handled
        @listenTo this, 'remove', (model) =>
            model.error = 'aborted'

        # when an upload completes or fails, we keep counts
        @listenTo this, 'sync error', (model) =>
            path = model.get('path') + '/'
            @uploadingPaths[path]--
            @loaded++

        # proxy progress events, throttled to every 100ms
        @listenTo this, 'progress', _.throttle =>
            @trigger 'upload-progress', @computeProgress()
        , 100

        # when the queue is totally completed
        @asyncQueue.drain = =>
            @completed = true
            @trigger 'upload-complete'

    add: ->
        @reset() if @completed
        super

    reset: (models, options) ->
        @loaded = 0
        @completed = false
        @uploadingPaths = {}
        super

    computeProgress: =>
        return @progress =
            loadedFiles: @loaded
            totalFiles: @length
            loadedBytes: @sumProp 'loaded'
            totalBytes: @sumProp 'total'

    sumProp: (prop) =>
        iter = (sum, model) -> sum + model[prop]
        @reduce iter, 0

    uploadWorker: (model, cb) =>
        if model.existing or model.error or model.isUploaded
            setTimeout cb, 10

        model.save null,
            success: ->
                model.file = null
                model.isUploaded = true
                model.loaded = model.total
                unless app.baseCollection.get model.id
                    app.baseCollection.add model
                cb null
            error: (_, err) =>
                body = try JSON.parse(err.responseText)
                catch e then msg: null

                if err.status is 400 and body.code is 'EEXISTS'
                    model.existing = true
                    return cb new Error body.msg

                if err.status is 400 and body.code is 'ESTORAGE'
                    model.error = new Error body.msg
                    return cb model.error

                model.tries = 1 + (model.tries or 0)
                if model.tries > 3
                    model.error = t err.msg or "modal error file upload"
                else
                    # let's try again
                    @asyncQueue.push model
                cb err

    addBlobs: (blobs, folder) ->

        i = 0
        existingPaths = app.baseCollection.existingPaths()
        # we do a non blocking loop, handling one file every 2ms so the
        # UI don't get stuck
        do nonBlockingLoop = =>
            return unless blob = blobs[i++]

            path = folder.getRepository() or ''
            relPath = blob.relativePath or
                blob.mozRelativePath or
                blob.webkitRelativePath or
                blob.msRelativePath

            if relPath then path += '/' + Helpers.dirName relPath

            model = new File
                type: 'file'
                class: 'document'
                size: blob.size
                name: blob.name
                path: path
                lastModification: blob.lastModifiedDate

            if model.getRepository() in existingPaths
                model.existing = true
            else
                model.file = blob
                model.loaded = 0
                model.total = blob.size

            @add model
            @markAsBeingUploaded model

            setTimeout nonBlockingLoop, 2

    addFolderBlobs: (blobs, parent) ->

        dirs = Helpers.nestedDirs blobs
        i = 0
        #console.log dirs
        do nonBlockingLoop = =>

            # if no more folders to add, leave the loop
            unless dir = dirs[i++]
                # folders will be created
                # we can safely add files to bottom of queue
                blobs = _.filter blobs, (blob) ->
                    blob.name not in ['.', '..']
                @addBlobs blobs, parent
                return

            prefix = parent.getRepository()
            parts = dir.split('/').filter (x) -> x # ?remove empty last part
            name = parts[parts.length - 1]
            path = [prefix].concat(parts[...-1]).join '/'

            folder = new File
                type: "folder"
                name: name
                path: path

            folder.loaded = 0
            folder.total = 250 # ~ size of the query

            # add folder to be saved
            @add folder
            @markAsBeingUploaded folder

            setTimeout nonBlockingLoop, 2

    filteredByFolder: (folder, comparator) ->
        filteredUploads = new BackboneProjections.Filtered this,
            filter: (file) ->
                return file.get('path') is folder.getRepository() and
                    not file.isUploaded

            comparator: comparator

    getResults: ->
        error = []
        existing = []
        success = 0

        @each (model) ->
            if model.error
                console.log "Upload Error", model.getRepository(), model.error
                error.push model
            else if model.existing then existing.push model
            else success++

        status = if error.length then 'error'
        else if existing.length then 'warning'
        else 'success'

        return {status, error, existing, success}

    # we keep track of models being uploaded by path
    markAsBeingUploaded: (model) ->
        # appending a / prevents conflict with elements
        # having the same prefix in their names
        path = model.get('path') + '/'
        unless @uploadingPaths[path]?
            @uploadingPaths[path] = 0

        @uploadingPaths[path]++

    # returns the number of children elements being uploading for a given path
    getNumUploadingElementsByPath: (path) ->
        # appending a / prevents conflict with elements
        # having the same prefix in their names
        path = path + '/'

        return _.reduce @uploadingPaths, (memo, value, index) ->
            if index.indexOf(path) isnt -1 or path is ''
                return memo + value
            else
                return memo
        , 0

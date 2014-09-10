File = require '../models/file'

###
Represents a collection of files
It acts as the cache when instantiate as the baseCollection
The base collection holds ALL the files and folders of the application
It creates projections (subcollection) that will be consumed by folder views.
Those projections represents one folder.
###
module.exports = class FileCollection extends Backbone.Collection

    # Model that will be contained inside the collection.
    model: File

    # This is where ajax requests the backend.
    url: 'files'

    cachedPaths: []

    isPathCached: (path) -> @cachedPaths.indexOf(path) isnt -1

    ###
        Retrieves folder's information (meta data)
        * from memory if it's cached
        * otherwise, from server
    ###
    getFolderInfo: (folderID, callback) ->
        folder = @get folderID
        unless folder?
            #console.log "fetch folder info"
            folder = new File id: folderID, type: "folder"
            folder.fetch
                success: =>
                    @add folder
                    callback null, folder
                error: (xhr, resp) ->
                    callback status: resp.status, msg: resp.statusText
        else
            #console.log "[cache] fetch folder info"
            callback null, folder

    # Retrieves folder's content (files and folders in it)
    getFolderContent: (folder, callback = ->) ->
        #console.log "fetch folder content"
        path = folder.getRepository()
        folder.fetchContent (err, content, parents) =>
            if err?
                callback err
            else
                # adds the new models (updates them if already in collection)
                @set content, remove: false

                # we handle deletion manually because
                # they must be based on  projection, not baseCollection
                contentIDs = _.pluck content, 'id'
                path = folder.getRepository()
                itemsToRemove = @getSubCollection(path).filter (item) ->
                    return item.get('id') not in contentIDs
                @remove itemsToRemove

                # we mark as cached the folder if it's the first time we load
                # its content
                @cachedPaths.push path unless @isPathCached path
                callback()

    ###
        Global method to retrieve folder's info and content
        and create a subcollection (projection) based on the current collection
    ###
    getByFolder: (folderID, callback) ->
        @getFolderInfo folderID, (err, folder) =>
            if err? then callback err
            else
                path = folder.getRepository()
                filter = (file) ->
                    file.get('path') is path and not file.isRoot()

                collection = new BackboneProjections.Filtered @,
                                    filter: filter
                                    comparator: @comparator

                if @isPathCached path
                    #console.log "[cache] fetch folder content"
                    callback null, folder, collection
                else
                    # we retrieve at the same time the folder's content
                    # and the folder's breadcrumb
                    @getFolderContent folder, ->
                        callback null, folder, collection

    existingPaths: ->
        @map (model) -> model.getRepository()

    # Creates a sub collection (projection) based on the current collection
    getSubCollection: (path) ->
        filter = (file) ->
            return file.get('path') is path and not file.isRoot()
        return new BackboneProjections.Filtered @,
                            filter: filter
                            comparator: @comparator

    comparator: (f1, f2) ->

        # default values
        @type = 'name' unless @type?
        @order = 'asc' unless @order?

        t1 = f1.get 'type'
        t2 = f2.get 'type'

        # new folders should be at the topmost
        if f1.isFolder() and not f2.isFolder() and f1.isNew() then return -1
        if f2.isFolder() and not f1.isFolder() and f2.isNew() then return 1

        if @type is 'name'
            n1 = f1.get('name').toLocaleLowerCase()
            n2 = f2.get('name').toLocaleLowerCase()
        else if @type is "lastModification"
            n1 = new Date(f1.get 'lastModification').getTime()
            n2 = new Date(f2.get 'lastModification').getTime()
        else
            n1 = f1.get @type
            n2 = f2.get @type

        sort = if @order is 'asc' then -1 else 1

        if t1 is t2
            if @type is 'class' and n1 is n2

                # Sort by name if the class is the same
                n1 = f1.get('name').toLocaleLowerCase()
                n2 = f2.get('name').toLocaleLowerCase()

                # Get both file extensions
                e1 = n1.split('.').pop()
                e2 = n2.split('.').pop()

                if e1 isnt e2
                    # Sort by file extension if they are different
                    if e1 > e2 then return -sort
                    if e1 < e2 then return sort
                    return 0

            # Sort normally
            if n1 > n2 then return -sort
            else if n1 < n2 then return sort
            else return 0

        else if t1 is 'file' and t2 is 'folder'
            return 1
        else # t1 is 'folder' and t2 is 'file'
            return -1

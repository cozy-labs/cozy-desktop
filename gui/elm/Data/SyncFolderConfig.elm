module Data.SyncFolderConfig exposing
    ( SyncFolderConfig
    , isValid
    , setError
    , valid
    )


type alias SyncFolderConfig =
    { folder : String
    , error : Maybe String
    }


valid : String -> SyncFolderConfig
valid folder =
    { folder = folder
    , error = Nothing
    }


isValid : SyncFolderConfig -> Bool
isValid model =
    case model.error of
        Nothing ->
            True

        Just _ ->
            False


setError : SyncFolderConfig -> String -> SyncFolderConfig
setError folderConfig error =
    { folderConfig
        | error =
            if error == "" then
                Nothing

            else
                Just error
    }

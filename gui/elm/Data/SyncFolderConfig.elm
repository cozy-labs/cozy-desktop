module Data.SyncFolderConfig exposing
    ( SyncFolderConfig
    , init
    , isValid
    , setError
    )


type alias SyncFolderConfig =
    { folder : String
    , error : Maybe String
    }


init : String -> SyncFolderConfig
init folder =
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

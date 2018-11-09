module Data.SyncFolderConfig exposing
    ( SyncFolderConfig
    , isValid
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

module Data.SyncError exposing
    ( EncodedSyncError
    , SyncError
    , message
    )


type alias SyncError =
    EncodedSyncError


type alias EncodedSyncError =
    { name : String
    , code : String
    }


decode : EncodedSyncError -> SyncError
decode { name, code } =
    { name = name
    , code = code
    }


message : SyncError -> String
message error =
    case error.code of
        _ ->
            "Dashboard Synchronization impossible"

module Model exposing (..)


type Status
    = Starting
    | UpToDate
    | Offline
    | Buffering
    | SquashPrepMerging
    | Syncing Int
    | Error String

module Model exposing (..)


type Status
    = Starting
    | UpToDate
    | Offline
    | UserActionRequired
    | Buffering
    | SquashPrepMerging
    | Syncing Int
    | Error String


type Platform
    = Windows
    | Linux
    | Darwin

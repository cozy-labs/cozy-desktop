module Data.Status exposing (Status(..), fromString, init)

import Data.SyncError exposing (SyncError)


type Status
    = Starting
    | UpToDate
    | Offline
    | UserActionRequired
    | Buffering
    | SquashPrepMerging
    | Syncing Int
    | Error SyncError


init : Status
init =
    Starting


fromString : String -> Int -> SyncError -> Status
fromString str remaining latestError =
    case str of
        "syncing" ->
            Syncing remaining

        "buffering" ->
            Buffering

        "squashprepmerge" ->
            SquashPrepMerging

        "uptodate" ->
            UpToDate

        "user-alert" ->
            UserActionRequired

        "offline" ->
            Offline

        "error" ->
            Error latestError

        _ ->
            UpToDate

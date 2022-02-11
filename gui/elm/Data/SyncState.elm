port module Data.SyncState exposing
    ( EncodedSyncState
    , SyncState
    , decode
    , gotNewState
    , init
    )

import Data.Status as Status exposing (Status)
import Data.SyncError as SyncError exposing (EncodedSyncError, SyncError)
import Data.UserAlert as UserAlert exposing (EncodedUserAlert, UserAlert)


type alias SyncState =
    { status : Status
    , userAlerts : List UserAlert
    }


init : SyncState
init =
    { status = Status.init
    , userAlerts = []
    }



-- Communicate through Ports


port syncState : (EncodedSyncState -> msg) -> Sub msg


gotNewState : (SyncState -> msg) -> Sub msg
gotNewState msg =
    syncState (msg << decode)


type alias EncodedSyncState =
    { status : String
    , remaining : Int
    , userAlerts : List EncodedUserAlert
    , errors : List EncodedSyncError
    }


decode : EncodedSyncState -> SyncState
decode { status, remaining, userAlerts, errors } =
    let
        decodedAlerts =
            List.foldr
                (\a list ->
                    case UserAlert.decode a of
                        Just d ->
                            d :: list

                        _ ->
                            list
                )
                []
                userAlerts

        latestError =
            SyncError.decodeLatest errors
    in
    { status = Status.fromString status remaining latestError
    , userAlerts = decodedAlerts
    }

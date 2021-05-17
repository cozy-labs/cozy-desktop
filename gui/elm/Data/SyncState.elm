port module Data.SyncState exposing
    ( EncodedSyncState
    , SyncState
    , decode
    , gotNewState
    , init
    )

import Data.Status as Status exposing (Status)
import Data.SyncError as SyncError exposing (EncodedSyncError)
import Data.UserAction as UserAction exposing (EncodedUserAction, UserAction)


type alias SyncState =
    { status : Status
    , userActions : List UserAction
    }


init : SyncState
init =
    { status = Status.init
    , userActions = []
    }



-- Communicate through Ports


port syncState : (EncodedSyncState -> msg) -> Sub msg


gotNewState : (SyncState -> msg) -> Sub msg
gotNewState msg =
    syncState (msg << decode)


type alias EncodedSyncState =
    { status : String
    , remaining : Int
    , userActions : List EncodedUserAction
    , errors : List EncodedSyncError
    }


decode : EncodedSyncState -> SyncState
decode { status, remaining, userActions, errors } =
    let
        decodedActions =
            List.foldr
                (\a list ->
                    case UserAction.decode a of
                        Just d ->
                            d :: list

                        _ ->
                            list
                )
                []
                userActions

        latestError =
            List.reverse errors
                |> List.head
                |> Maybe.map SyncError.message
                |> Maybe.withDefault ""
    in
    { status = Status.fromString status remaining latestError
    , userActions = decodedActions
    }

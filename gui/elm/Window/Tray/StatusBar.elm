module Window.Tray.StatusBar exposing
    ( icon
    , imgIcon
    , statusToString
    , view
    , viewMessage
    )

import Data.Platform exposing (Platform(..))
import Data.Status exposing (Status(..))
import Data.SyncError as SyncError
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import I18n exposing (..)
import Icons



-- Status line component


imgIcon : String -> String -> Html msg
imgIcon srcPath className =
    img
        [ src srcPath
        , class <| "status__icon status__icon--" ++ className
        ]
        []


icon : Status -> Platform -> Html msg
icon status platform =
    case platform of
        Darwin ->
            case status of
                UpToDate ->
                    imgIcon "images/tray-icon-macos/idleTemplate@2x.png" "uptodate"

                UserActionRequired ->
                    imgIcon "images/tray-icon-macos/errorTemplate@2x.png" "error"

                Offline ->
                    imgIcon "images/tray-icon-macos/offlineTemplate@2x.png" "offline"

                Error _ ->
                    imgIcon "images/tray-icon-macos/errorTemplate@2x.png" "error"

                _ ->
                    span [ class "status__icon spin" ] []

        _ ->
            case status of
                UpToDate ->
                    imgIcon "images/tray-icon/idle.png" "uptodate"

                UserActionRequired ->
                    imgIcon "images/tray-icon/error.png" "error"

                Offline ->
                    imgIcon "images/tray-icon/offline.png" "offline"

                Error _ ->
                    imgIcon "images/tray-icon/error.png" "error"

                _ ->
                    span [ class "status__icon spin" ] []


statusToString : Helpers -> Status -> String
statusToString helpers status =
    case status of
        UpToDate ->
            helpers.t "Dashboard Your Twake Workplace is up to date!"

        Offline ->
            helpers.t "Dashboard Offline"

        UserActionRequired ->
            helpers.t "Dashboard Some files could not be synced"

        Starting ->
            helpers.t "Dashboard Sync in progress (preparation)"

        Buffering ->
            helpers.t "Dashboard Sync in progress (preparation)"

        SquashPrepMerging ->
            helpers.t "Dashboard Sync in progress (preparation)"

        Syncing _ ->
            helpers.t "Dashboard Sync in progress (transfer)"

        Error _ ->
            helpers.t "Dashboard Error:"


viewMessage : Helpers -> Status -> List (Html msg)
viewMessage helpers status =
    case
        status
    of
        Error error ->
            [ text (statusToString helpers status)
            , text " "
            , em [] [ text (helpers.t (SyncError.message error)) ]
            ]

        _ ->
            [ text (statusToString helpers status) ]


view : Helpers -> Status -> Platform -> Bool -> msg -> Html msg
view helpers status platform showAlerts toggleMsg =
    div
        [ classList
            [ ( "status", True )
            , ( "blue", platform /= Darwin )
            , ( "status--warning", status == UserActionRequired )
            ]
        ]
        [ span [ class "status_img" ] [ icon status platform ]
        , span [ class "status_text" ] (viewMessage helpers status)
        , if status == UserActionRequired then
            span
                [ class "status__view-btn"
                , onClick toggleMsg
                ]
                [ text (helpers.t "Bar View alerts")
                , span
                    [ classList
                        [ ( "chevron", True )
                        , ( "chevron--down", showAlerts )
                        ]
                    ]
                    [ Icons.chevronRight 12 False ]
                ]

          else
            Html.text ""
        ]

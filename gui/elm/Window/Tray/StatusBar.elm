module Window.Tray.StatusBar exposing
    ( icon
    , imgIcon
    , statusToString
    , view
    , viewMessage
    )

import Data.Platform exposing (Platform(..))
import Data.Status exposing (Status(..))
import Html exposing (..)
import Html.Attributes exposing (..)
import Locale exposing (..)



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
                    imgIcon "images/tray-icon-osx/idleTemplate@2x.png" "uptodate"

                UserActionRequired ->
                    imgIcon "images/tray-icon-osx/pauseTemplate@2x.png" "offline"

                Offline ->
                    imgIcon "images/tray-icon-osx/offlineTemplate@2x.png" "offline"

                Error _ ->
                    imgIcon "images/tray-icon-osx/errorTemplate@2x.png" "error"

                _ ->
                    span [ class "status__icon spin" ] []

        _ ->
            case status of
                UpToDate ->
                    imgIcon "images/tray-icon-win/idle.png" "uptodate"

                UserActionRequired ->
                    imgIcon "images/tray-icon-win/pause.png" "offline"

                Offline ->
                    imgIcon "images/tray-icon-win/offline.png" "offline"

                Error _ ->
                    imgIcon "images/tray-icon-win/error.png" "error"

                _ ->
                    span [ class "status__icon spin" ] []


statusToString : Helpers -> Status -> String
statusToString helpers status =
    case status of
        UpToDate ->
            helpers.t "Dashboard Your cozy is up to date!"

        Offline ->
            helpers.t "Dashboard Offline"

        UserActionRequired ->
            helpers.t "Dashboard Synchronization suspended"

        Starting ->
            helpers.t "Dashboard Analyze"

        Buffering ->
            helpers.t "Dashboard Analyze"

        SquashPrepMerging ->
            helpers.t "Dashboard Prepare"

        Syncing _ ->
            helpers.t "Dashboard Syncing"

        Error _ ->
            helpers.t "Dashboard Error:"


viewMessage : Helpers -> Status -> List (Html msg)
viewMessage helpers status =
    case
        status
    of
        Error message ->
            [ text (statusToString helpers status)
            , text " "
            , em [] [ text message ]
            ]

        _ ->
            [ text (statusToString helpers status) ]


view : Helpers -> Status -> Platform -> Html msg
view helpers status platform =
    div
        [ class
            (if platform == Darwin then
                "status"

             else
                "status blue"
            )
        ]
        [ span [ class "status_img" ] [ icon status platform ]
        , span [ class "status_text" ] (viewMessage helpers status)
        ]

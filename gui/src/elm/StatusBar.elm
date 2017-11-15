module StatusBar exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Icons
import Helpers exposing (..)
import Model exposing (Status(..))


-- Status line component
-- Model


iconName : Status -> String
iconName status =
    case status of
        UpToDate ->
            "images/tray-icon-osx/idleTemplate@2x.png"

        Offline ->
            "images/tray-icon-osx/pauseTemplate@2x.png"

        Error _ ->
            "images/tray-icon-osx/errorTemplate@2x.png"

        _ ->
            "images/tray-icon-osx/syncTemplate@2x.png"


iconClass : Status -> String
iconClass status =
    case status of
        UpToDate ->
            "uptodate"

        Offline ->
            "offline"

        Error _ ->
            "error"

        _ ->
            "sync"


viewMessage : Helpers -> Status -> List (Html msg)
viewMessage helpers status =
    case
        status
    of
        UpToDate ->
            [ text (helpers.t "Dashboard Your cozy is up to date!") ]

        Offline ->
            [ text (helpers.t "Dashboard Offline") ]

        Starting ->
            [ text (helpers.t "Dashboard Analyze") ]

        Buffering ->
            [ text (helpers.t "Dashboard Analyze") ]

        SquashPrepMerging ->
            [ text (helpers.t "Dashboard Prepare") ]

        Syncing n ->
            [ text (helpers.t "Dashboard Synchronize")
            , text " ("
            , text (helpers.pluralize n "Dashboard left SINGULAR" "Dashboard left PLURAL")
            , text ")"
            ]

        Error message ->
            [ text (helpers.t "Dashboard Error:")
            , text " "
            , em [] [ text message ]
            ]


view : Helpers -> Status -> Html msg
view helpers status =
    div [ class "status" ]
        [ span [ class "status_img" ]
            [ img
                [ src (iconName status)
                , class <| "status__icon status__icon--" ++ iconClass status
                ]
                []
            ]
        , span [ class "status_text" ] (viewMessage helpers status)
        ]

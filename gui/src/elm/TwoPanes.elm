port module TwoPanes exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Helpers exposing (Helpers)
import Icons
import Dashboard
import Settings
import Help


-- @TODO This file should be named tabs
-- MODEL


type Tab
    = DashboardTab
    | SettingsTab



-- | AppsTab in the future


type alias Model =
    { tab : Tab
    , dashboard : Dashboard.Model
    , settings : Settings.Model
    , help : Help.Model
    }


init : String -> Model
init version =
    { tab = DashboardTab
    , dashboard = Dashboard.init
    , settings = Settings.init version
    , help = Help.init
    }



-- UPDATE


type Msg
    = NoOp
    | GoToCozy
    | GoToFolder
    | GoToTab Tab
    | GoToStrTab String
    | FillAddressAndDevice ( String, String )
    | DashboardMsg Dashboard.Msg
    | SettingsMsg Settings.Msg


port gotocozy : () -> Cmd msg


port gotofolder : () -> Cmd msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        NoOp ->
            ( model, Cmd.none )

        GoToCozy ->
            ( model, gotocozy () )

        GoToFolder ->
            ( model, gotofolder () )

        GoToTab tab_ ->
            let
                dashboard =
                    model.dashboard

                newDashboard =
                    { dashboard | page = 1 }
            in
                ( { model | tab = tab_, dashboard = newDashboard }, Cmd.none )

        GoToStrTab tab ->
            case
                tab
            of
                "settings" ->
                    update (GoToTab SettingsTab) model

                _ ->
                    update (GoToTab DashboardTab) model

        FillAddressAndDevice info ->
            let
                ( settings, _ ) =
                    Settings.update (Settings.FillAddressAndDevice info) model.settings
            in
                ( { model | settings = settings }, Cmd.none )

        DashboardMsg subMsg ->
            let
                dashboard =
                    Dashboard.update subMsg model.dashboard
            in
                ( { model | dashboard = dashboard }, Cmd.none )

        SettingsMsg subMsg ->
            let
                ( settings, cmd ) =
                    Settings.update subMsg model.settings
            in
                ( { model | settings = settings }, Cmd.map SettingsMsg cmd )



-- VIEW


menu_item helpers model title tab =
    div
        [ classList
            [ ( "two-panes__menu__item", True )
            , ( "two-panes__menu__item--active", model.tab == tab )
            ]
        , onClick (GoToTab tab)
        ]
        [ text (helpers.t ("TwoPanes " ++ title))
        ]


menu helpers model =
    aside [ class "two-panes__menu" ]
        [ menu_item helpers model "Recents" DashboardTab
        , menu_item helpers model "Settings" SettingsTab
        ]


view : Helpers -> Model -> Html Msg
view helpers model =
    div [ class "container" ]
        [ case
            model.dashboard.status
          of
            Dashboard.UpToDate ->
                div [ class "status" ]
                    [ img
                        [ src "images/tray-icon-osx/idleTemplate@2x.png"
                        , class "status__icon status__icon--uptodate"
                        ]
                        []
                    , text (helpers.t "Dashboard Your cozy is up to date!")
                    ]

            Dashboard.Offline ->
                div [ class "status" ]
                    [ img
                        [ src "images/tray-icon-osx/pauseTemplate@2x.png"
                        , class "status__icon status__icon--offline"
                        ]
                        []
                    , text (helpers.t "Dashboard Offline")
                    ]

            Dashboard.Sync filename ->
                div [ class "status" ]
                    [ img
                        [ src "images/tray-icon-osx/syncTemplate@2x.png"
                        , class "status__icon status__icon--sync"
                        ]
                        []
                    , span []
                        [ text (helpers.t "Dashboard Syncing")
                        , text " "
                        , em [] [ text filename ]
                        ]
                    ]

            Dashboard.Error message ->
                div [ class "status" ]
                    [ img
                        [ src "images/tray-icon-osx/errorTemplate@2x.png"
                        , class "status__icon status__icon--error"
                        ]
                        []
                    , span []
                        [ text (helpers.t "Dashboard Error:")
                        , text " "
                        , em [] [ text message ]
                        ]
                    ]
        , section [ class "two-panes" ]
            [ menu helpers model
            , case model.tab of
                DashboardTab ->
                    Html.map DashboardMsg (Dashboard.view helpers model.dashboard)

                SettingsTab ->
                    Html.map SettingsMsg (Settings.view helpers model.settings)
            ]
        , div [ class "bottom-bar" ]
            [ a
                [ href "#"
                , onClick GoToFolder
                ]
                [ Icons.folder 48 False
                , text (helpers.t "Bar GoToFolder")
                ]
            , a
                [ href "#"
                , onClick GoToCozy
                ]
                [ Icons.globe 48 False
                , text (helpers.t "Bar GoToCozy")
                ]
            ]
        ]

module Window.Tray exposing
    ( Model
    , Msg(..)
    , Page(..)
    , init
    , subscriptions
    , update
    , view
    )

import Data.Platform exposing (Platform)
import Data.Status as Status exposing (Status)
import Data.SyncConfig as SyncConfig exposing (SyncConfig)
import Data.SyncState as SyncState exposing (SyncState)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import I18n exposing (Helpers)
import Icons
import Ports
import Time
import Window.Tray.Dashboard as Dashboard
import Window.Tray.Settings as Settings
import Window.Tray.StatusBar as StatusBar



-- MODEL


type Page
    = DashboardPage
    | SettingsPage


type alias Model =
    { dashboard : Dashboard.Model
    , page : Page
    , platform : Platform
    , settings : Settings.Model
    , status : Status
    , syncState : SyncState
    }


init : String -> Platform -> Model
init version platform =
    { dashboard = Dashboard.init platform
    , page = DashboardPage
    , platform = platform
    , settings = Settings.init version
    , status = Status.init
    , syncState = SyncState.init
    }



-- UPDATE


type Msg
    = GotSyncState SyncState
    | GotSyncConfig SyncConfig
    | GoToCozy
    | GoToFolder
    | GoToTab Page
    | GoToStrTab String
    | DashboardMsg Dashboard.Msg
    | SettingsMsg Settings.Msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        GotSyncState syncState ->
            let
                status =
                    syncState.status

                ( settings, _ ) =
                    case syncState.status of
                        Status.UpToDate ->
                            Settings.update Settings.EndManualSync model.settings

                        _ ->
                            ( model.settings, Cmd.none )

                ( dashboard, cmd ) =
                    Dashboard.update (Dashboard.GotUserAlerts syncState.userAlerts) model.dashboard
            in
            ( { model
                | status = status
                , dashboard = dashboard
                , settings = settings
                , syncState = syncState
              }
            , Cmd.none
            )

        GotSyncConfig config ->
            let
                ( settings, _ ) =
                    Settings.update (Settings.GotSyncConfig config) model.settings
            in
            ( { model | page = DashboardPage, settings = settings }, Cmd.none )

        DashboardMsg subMsg ->
            let
                ( dashboard, cmd ) =
                    Dashboard.update subMsg model.dashboard
            in
            ( { model | dashboard = dashboard }, cmd )

        SettingsMsg subMsg ->
            let
                ( settings, cmd ) =
                    Settings.update subMsg model.settings
            in
            ( { model | settings = settings }, Cmd.map SettingsMsg cmd )

        GoToCozy ->
            ( model, Ports.gotocozy () )

        GoToFolder ->
            ( model, Ports.gotofolder () )

        GoToTab tab ->
            let
                ( dashboard, cmd ) =
                    Dashboard.update Dashboard.Reset model.dashboard
            in
            ( { model | page = tab, dashboard = dashboard }, cmd )

        GoToStrTab tabstr ->
            case
                tabstr
            of
                "settings" ->
                    update (GoToTab SettingsPage) model

                _ ->
                    update (GoToTab DashboardPage) model



-- SUBSCRIPTIONS


subscriptions : Model -> Sub Msg
subscriptions model =
    Sub.batch
        [ SyncConfig.gotSyncConfig GotSyncConfig
        , Ports.gototab GoToStrTab
        , SyncState.gotNewState GotSyncState

        -- Dashboard subscriptions
        , Time.every 1000 (DashboardMsg << Dashboard.Tick)
        , Ports.transfer (DashboardMsg << Dashboard.Transfer)
        , Ports.remove (DashboardMsg << Dashboard.Remove)

        -- Settings subscriptions
        , Ports.newRelease (SettingsMsg << Settings.NewRelease)
        , Ports.diskSpace (SettingsMsg << Settings.UpdateDiskSpace)
        , Ports.autolaunch (SettingsMsg << Settings.AutoLaunchSet)
        , Ports.cancelUnlink (always (SettingsMsg Settings.CancelUnlink))
        ]



-- VIEW


view : Helpers -> Model -> Html Msg
view helpers model =
    div [ class "container" ]
        [ StatusBar.view helpers model.status model.platform
        , viewTabsWithContent helpers model
        , viewBottomBar helpers
        ]


viewTabsWithContent : Helpers -> Model -> Html Msg
viewTabsWithContent helpers model =
    section [ class "two-panes" ]
        [ aside [ class "two-panes__menu" ]
            [ viewTab helpers model "Recents" DashboardPage
            , viewTab helpers model "Settings" SettingsPage
            ]
        , case model.page of
            DashboardPage ->
                Html.map DashboardMsg (Dashboard.view helpers model.dashboard)

            SettingsPage ->
                Html.map SettingsMsg (Settings.view helpers model.status model.settings)
        ]


viewTab : Helpers -> Model -> String -> Page -> Html Msg
viewTab helpers model title page =
    div
        [ classList
            [ ( "two-panes__menu__item", True )
            , ( "two-panes__menu__item--active", model.page == page )
            ]
        , onClick (GoToTab page)
        ]
        [ text (helpers.t ("TwoPanes " ++ title))
        ]


viewBottomBar : Helpers -> Html Msg
viewBottomBar helpers =
    div [ class "bottom-bar" ]
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

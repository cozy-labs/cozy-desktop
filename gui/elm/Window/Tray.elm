module Window.Tray exposing
    ( Model
    , Msg(..)
    , Page(..)
    , init
    , subscriptions
    , update
    , view
    )

import Data.Confirmation as Confirmation exposing (ConfirmationID)
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
import Util.Conditional exposing (ShowInWeb, inWeb, onOS)
import Util.Mouse as Mouse
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
    | GotConfirmation ( ConfirmationID, Bool )
    | GoToTwake ShowInWeb
    | GoToFolder ShowInWeb
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

        GotConfirmation ( id, confirmed ) ->
            let
                ( settings, cmd ) =
                    Settings.update (Settings.GotConfirmation ( id, confirmed )) model.settings
            in
            ( { model | settings = settings }, Cmd.map SettingsMsg cmd )

        DashboardMsg subMsg ->
            let
                ( dashboard, cmd ) =
                    Dashboard.update subMsg model.dashboard
            in
            ( { model | dashboard = dashboard }, cmd )

        SettingsMsg (Settings.GotReinitializationStatus "started") ->
            let
                ( settings, cmd ) =
                    Settings.update (Settings.GotReinitializationStatus "started") model.settings

                ( dashboard, _ ) =
                    Dashboard.update Dashboard.Reset model.dashboard
            in
            ( { model
                | page = DashboardPage
                , dashboard = dashboard
                , settings = settings
              }
            , Cmd.map SettingsMsg cmd
            )

        SettingsMsg subMsg ->
            let
                ( settings, cmd ) =
                    Settings.update subMsg model.settings
            in
            ( { model | settings = settings }, Cmd.map SettingsMsg cmd )

        GoToTwake showInWeb ->
            ( model, Ports.gototwake showInWeb )

        GoToFolder showInWeb ->
            ( model, Ports.gotofolder showInWeb )

        GoToTab tab ->
            let
                ( dashboard, cmd ) =
                    Dashboard.update Dashboard.ShowFirstPage model.dashboard
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
        , Confirmation.gotConfirmation GotConfirmation

        -- Dashboard subscriptions
        , Time.every 1000 (DashboardMsg << Dashboard.Tick)
        , Ports.transfer (DashboardMsg << Dashboard.Transfer)
        , Ports.remove (DashboardMsg << Dashboard.Remove)

        -- Settings subscriptions
        , Ports.newRelease (SettingsMsg << Settings.NewRelease)
        , Settings.gotDiskSpace (SettingsMsg << Settings.UpdateDiskSpace)
        , Ports.autolaunch (SettingsMsg << Settings.AutoLaunchSet)
        , Ports.reinitialization (SettingsMsg << Settings.GotReinitializationStatus)
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
            , Mouse.onSpecialClick handleGoToFolder
            ]
            [ Icons.folder 48 False
            , text (helpers.t "Bar GoToFolder")
            ]
        , a
            [ href "#"
            , Mouse.onSpecialClick handleGoToTwake
            ]
            [ Icons.globe 48 False
            , text (helpers.t "Bar GoToTwake")
            ]
        ]


handleGoToFolder : Mouse.EventWithKeys -> Msg
handleGoToFolder mouseEvent =
    if mouseEvent.keys.ctrl || mouseEvent.keys.meta then
        GoToFolder inWeb

    else
        GoToFolder onOS


handleGoToTwake : Mouse.EventWithKeys -> Msg
handleGoToTwake mouseEvent =
    if mouseEvent.keys.ctrl || mouseEvent.keys.meta then
        GoToTwake onOS

    else
        GoToTwake inWeb

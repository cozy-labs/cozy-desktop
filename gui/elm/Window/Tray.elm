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
import Data.RemoteWarning exposing (RemoteWarning)
import Data.Status as Status exposing (Status)
import Data.SyncState as SyncState exposing (SyncState)
import Data.UserActionRequiredError exposing (UserActionRequiredError)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Icons
import Locale exposing (Helpers)
import Ports
import Time
import Window.Tray.Dashboard as Dashboard
import Window.Tray.Settings as Settings
import Window.Tray.StatusBar as StatusBar
import Window.Tray.UserActionRequiredPage as UserActionRequiredPage



-- MODEL


type Page
    = DashboardPage
    | SettingsPage


type alias Model =
    { dashboard : Dashboard.Model
    , page : Page
    , platform : Platform
    , remoteWarnings : List RemoteWarning
    , settings : Settings.Model
    , status : Status
    , syncState : SyncState
    , userActionRequired : Maybe UserActionRequiredError
    }


init : String -> Platform -> Model
init version platform =
    { dashboard = Dashboard.init
    , page = DashboardPage
    , platform = platform
    , remoteWarnings = []
    , settings = Settings.init version
    , status = Status.init
    , syncState = SyncState.init
    , userActionRequired = Nothing
    }



-- UPDATE


type Msg
    = GotSyncState SyncState
    | SyncStart ( String, String )
    | UserActionRequired UserActionRequiredError
    | UserActionInProgress
    | RemoteWarnings (List RemoteWarning)
    | ClearCurrentWarning
    | SetError String
    | DashboardMsg Dashboard.Msg
    | SettingsMsg Settings.Msg
    | GoToCozy
    | GoToFolder
    | GoToTab Page
    | GoToStrTab String


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
            in
            ( { model
                | status = status
                , settings = settings
                , syncState = syncState
              }
            , Cmd.none
            )

        SyncStart info ->
            let
                ( settings, _ ) =
                    Settings.update (Settings.FillAddressAndDevice info) model.settings
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

        UserActionRequired error ->
            ( { model
                | status = Status.UserActionRequired
                , userActionRequired = Just error
              }
            , Cmd.none
            )

        UserActionInProgress ->
            ( model
            , Ports.userActionInProgress ()
            )

        RemoteWarnings warnings ->
            ( { model | remoteWarnings = warnings }, Cmd.none )

        ClearCurrentWarning ->
            ( { model
                | remoteWarnings =
                    List.tail model.remoteWarnings
                        |> Maybe.withDefault []
              }
            , Cmd.none
            )

        SetError error ->
            ( { model | status = Status.Error error }, Cmd.none )

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
        [ Ports.synchonization SyncStart
        , Ports.gototab GoToStrTab
        , Ports.syncError SetError
        , Ports.syncState (GotSyncState << SyncState.decode)
        , Ports.remoteWarnings RemoteWarnings
        , Ports.userActionRequired UserActionRequired

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
        , case model.userActionRequired of
            Just error ->
                UserActionRequiredPage.view helpers error UserActionInProgress

            Nothing ->
                viewTabsWithContent helpers model
        , viewWarning helpers model
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


viewWarning : Helpers -> Model -> Html Msg
viewWarning helpers model =
    case ( model.userActionRequired, model.remoteWarnings ) of
        ( Just err, _ ) ->
            text ""

        ( _, { title, detail, links, code } :: _ ) ->
            let
                actionLabel =
                    if code == "tos-updated" then
                        "Warning Read"

                    else
                        "Warning Ok"
            in
            div [ class "warningbar" ]
                [ p [] [ text detail ]
                , a
                    [ class "btn"
                    , href links.self
                    , onClick ClearCurrentWarning
                    ]
                    [ span [] [ text (helpers.t actionLabel) ] ]
                ]

        _ ->
            text ""


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

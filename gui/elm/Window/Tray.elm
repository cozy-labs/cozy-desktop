module Window.Tray
    exposing
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
import Data.Status exposing (Status(..))
import Data.UserActionRequiredError exposing (UserActionRequiredError)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Icons
import Locale exposing (Helpers)
import Ports
import Time exposing (Time)
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
    , userActionRequired : Maybe UserActionRequiredError
    }


init : String -> Platform -> Model
init version platform =
    { dashboard = Dashboard.init
    , page = DashboardPage
    , platform = platform
    , remoteWarnings = []
    , settings = Settings.init version
    , status = Starting
    , userActionRequired = Nothing
    }



-- UPDATE


type Msg
    = SyncStart ( String, String )
    | Updated
    | StartSyncing Int
    | StartBuffering
    | StartSquashPrepMerging
    | GoOffline
    | UserActionRequired UserActionRequiredError
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
        SyncStart info ->
            let
                ( settings, _ ) =
                    Settings.update (Settings.FillAddressAndDevice info) model.settings
            in
                ( { model | page = (DashboardPage), settings = settings }, Cmd.none )

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

        Updated ->
            ( { model | status = UpToDate }, Cmd.none )

        StartSyncing n ->
            ( { model | status = Syncing n }, Cmd.none )

        StartBuffering ->
            ( { model | status = Buffering }, Cmd.none )

        StartSquashPrepMerging ->
            ( { model | status = SquashPrepMerging }, Cmd.none )

        GoOffline ->
            ( { model | status = Offline }, Cmd.none )

        UserActionRequired error ->
            ( { model
                | status = Data.Status.UserActionRequired
                , userActionRequired = Just error
              }
            , Cmd.none
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
            ( { model | status = Error error }, Cmd.none )

        GoToCozy ->
            ( model, Ports.gotocozy () )

        GoToFolder ->
            ( model, Ports.gotofolder () )

        GoToTab tab ->
            let
                ( dashboard, cmd ) =
                    Dashboard.update Dashboard.Reset model.dashboard
            in
                ( { model | page = (tab), dashboard = dashboard }, cmd )

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
        , Ports.newRelease (SettingsMsg << Settings.NewRelease)
        , Ports.gototab GoToStrTab
        , Time.every Time.second (DashboardMsg << Dashboard.Tick)
        , Ports.transfer (DashboardMsg << Dashboard.Transfer)
        , Ports.remove (DashboardMsg << Dashboard.Remove)
        , Ports.diskSpace (SettingsMsg << Settings.UpdateDiskSpace)
        , Ports.syncError SetError
        , Ports.offline (always GoOffline)
        , Ports.remoteWarnings RemoteWarnings
        , Ports.userActionRequired UserActionRequired
        , Ports.buffering (always StartBuffering)
        , Ports.squashPrepMerge (always StartSquashPrepMerging)
        , Ports.updated (always Updated)
        , Ports.syncing StartSyncing
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
                UserActionRequiredPage.view helpers error

            Nothing ->
                section [ class "two-panes" ]
                    [ aside [ class "two-panes__menu" ]
                        [ menu_item helpers model "Recents" DashboardPage
                        , menu_item helpers model "Settings" SettingsPage
                        ]
                    , case model.page of
                        DashboardPage ->
                            Html.map DashboardMsg (Dashboard.view helpers model.dashboard)

                        SettingsPage ->
                            Html.map SettingsMsg (Settings.view helpers model.settings)
                    ]
        , viewWarnings helpers model
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


menu_item : Helpers -> Model -> String -> Page -> Html Msg
menu_item helpers model title page =
    div
        [ classList
            [ ( "two-panes__menu__item", True )
            , ( "two-panes__menu__item--active", model.page == page )
            ]
        , onClick (GoToTab page)
        ]
        [ text (helpers.t ("TwoPanes " ++ title))
        ]


viewWarnings : Helpers -> Model -> Html Msg
viewWarnings helpers model =
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
                        [ text (helpers.t actionLabel) ]
                    ]

        _ ->
            text ""

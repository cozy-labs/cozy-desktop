port module Main exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Dict exposing (Dict)
import Json.Decode as Json
import Time exposing (Time)
import Locale exposing (Helpers, Locale)
import Model exposing (..)
import Help
import Icons
import Wizard
import Address
import Folder
import Dashboard
import Settings
import Updater
import StatusBar
import Page.UserActionRequired


main : Program Flags Model Msg
main =
    Html.programWithFlags
        { init = init
        , update = update
        , view = view
        , subscriptions = subscriptions
        }



-- MODEL
-- type Tab
--     = DashboardPage
--     | SettingsPage


type Page
    = WizardPage
    | DashboardPage
    | SettingsPage
    | UpdaterPage
    | HelpPage
    | UserActionRequiredPage UserActionRequiredError


type alias Model =
    { localeIdentifier : String
    , locales : Dict String Locale
    , page : Page
    , wizard : Wizard.Model
    , dashboard : Dashboard.Model
    , settings : Settings.Model
    , updater : Updater.Model
    , status : Status
    , help : Help.Model
    , platform : Platform
    , remoteWarnings : List RemoteWarning
    }


type alias Flags =
    { page : String
    , folder : String
    , locale : String
    , locales : Json.Value
    , platform : String
    , version : String
    }


init : Flags -> ( Model, Cmd Msg )
init flags =
    let
        locales =
            case
                Json.decodeValue (Json.dict (Json.dict Json.string)) flags.locales
            of
                Ok value ->
                    value

                Err _ ->
                    Dict.empty

        page =
            case flags.page of
                "onboarding" ->
                    WizardPage

                "help" ->
                    HelpPage

                "dashboard" ->
                    DashboardPage

                "settings" ->
                    SettingsPage

                "updater" ->
                    UpdaterPage

                -- Temporarily use the MsgMechanism to
                -- get to the 2Panes page.
                _ ->
                    WizardPage

        platform =
            case flags.platform of
                "win32" ->
                    Windows

                "darwin" ->
                    Darwin

                _ ->
                    Linux

        model =
            { localeIdentifier = flags.locale
            , wizard = Wizard.init flags.folder flags.platform
            , dashboard = Dashboard.init
            , settings = Settings.init flags.version
            , updater = Updater.init flags.version
            , status = Starting
            , platform = platform
            , help = Help.init
            , locales = locales
            , page = page
            , remoteWarnings = []
            }
    in
        ( model, Cmd.none )



-- UPDATE


type Msg
    = NoOp
    | WizardMsg Wizard.Msg
    | SyncStart ( String, String )
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
    | HelpMsg Help.Msg
    | UpdaterMsg Updater.Msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        WizardMsg subMsg ->
            let
                ( wizard_, cmd ) =
                    Wizard.update subMsg model.wizard
            in
                ( { model | wizard = wizard_ }, Cmd.map WizardMsg cmd )

        SyncStart info ->
            let
                ( settings, _ ) =
                    Settings.update (Settings.FillAddressAndDevice info) model.settings
            in
                ( { model | page = (DashboardPage), settings = settings }, Cmd.none )

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
                | status = Model.UserActionRequired
                , page = UserActionRequiredPage error
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
            ( model, gotocozy () )

        GoToFolder ->
            ( model, gotofolder () )

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

        NoOp ->
            ( model, Cmd.none )

        HelpMsg subMsg ->
            let
                ( help, cmd ) =
                    Help.update subMsg model.help
            in
                ( { model | help = help }, Cmd.map HelpMsg cmd )

        UpdaterMsg subMsg ->
            let
                ( updater, cmd ) =
                    Updater.update subMsg model.updater
            in
                ( { model | updater = updater }, Cmd.map UpdaterMsg cmd )



-- SUBSCRIPTIONS


port registrationError : (String -> msg) -> Sub msg


port registrationDone : (Bool -> msg) -> Sub msg


port folderError : (String -> msg) -> Sub msg


port folder : (Folder.Model -> msg) -> Sub msg


port synchonization : (( String, String ) -> msg) -> Sub msg


port newRelease : (( String, String ) -> msg) -> Sub msg


port gototab : (String -> msg) -> Sub msg


port gotocozy : () -> Cmd msg


port gotofolder : () -> Cmd msg


port offline : (Bool -> msg) -> Sub msg


port remoteWarnings : (List RemoteWarning -> msg) -> Sub msg


port userActionRequired : (UserActionRequiredError -> msg) -> Sub msg


port updated : (Bool -> msg) -> Sub msg


port syncing : (Int -> msg) -> Sub msg


port squashPrepMerge : (Bool -> msg) -> Sub msg


port buffering : (Bool -> msg) -> Sub msg


port transfer : (Dashboard.File -> msg) -> Sub msg


port remove : (Dashboard.File -> msg) -> Sub msg


port diskSpace : (Settings.DiskSpace -> msg) -> Sub msg


port syncError : (String -> msg) -> Sub msg


port autolaunch : (Bool -> msg) -> Sub msg


port mail : (Maybe String -> msg) -> Sub msg


port cancelUnlink : (Bool -> msg) -> Sub msg


port updateDownloading : (Maybe Updater.Progress -> msg) -> Sub msg


port updateError : (String -> msg) -> Sub msg



-- https://github.com/elm-lang/elm-compiler/issues/1367


subscriptions : Model -> Sub Msg
subscriptions model =
    Sub.batch
        [ registrationError (WizardMsg << Wizard.AddressMsg << Address.RegistrationError)
        , registrationDone (always (WizardMsg Wizard.RegistrationDone))
        , folderError (WizardMsg << Wizard.FolderMsg << Folder.SetError)
        , folder (WizardMsg << Wizard.FolderMsg << Folder.FillFolder)
        , synchonization SyncStart
        , newRelease (SettingsMsg << Settings.NewRelease)
        , gototab (GoToStrTab)
        , Time.every Time.second (DashboardMsg << Dashboard.Tick)
        , transfer (DashboardMsg << Dashboard.Transfer)
        , remove (DashboardMsg << Dashboard.Remove)
        , diskSpace (SettingsMsg << Settings.UpdateDiskSpace)
        , syncError (SetError)
        , offline (always GoOffline)
        , remoteWarnings (RemoteWarnings)
        , userActionRequired UserActionRequired
        , buffering (always StartBuffering)
        , squashPrepMerge (always StartSquashPrepMerging)
        , updated (always Updated)
        , syncing StartSyncing
        , mail (HelpMsg << Help.MailSent)
        , autolaunch (SettingsMsg << Settings.AutoLaunchSet)
        , cancelUnlink (always (SettingsMsg Settings.CancelUnlink))
        , updateDownloading (UpdaterMsg << Updater.UpdateDownloading)
        , updateError (UpdaterMsg << Updater.UpdateError)
        ]



-- VIEW


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


renderWarnings helpers model =
    case ( model.page, model.remoteWarnings ) of
        ( UserActionRequiredPage err, _ ) ->
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


view : Model -> Html Msg
view model =
    let
        locale =
            case
                Dict.get model.localeIdentifier model.locales
            of
                Nothing ->
                    Dict.empty

                Just value ->
                    value

        helpers =
            Locale.helpers locale
    in
        case
            model.page
        of
            WizardPage ->
                Html.map WizardMsg (Wizard.view helpers model.wizard)

            HelpPage ->
                Html.map HelpMsg (Help.view helpers model.help)

            UpdaterPage ->
                Html.map UpdaterMsg (Updater.view helpers model.updater)

            _ ->
                div
                    [ class "container" ]
                    [ (StatusBar.view helpers model.status model.platform)
                    , case model.page of
                        UserActionRequiredPage error ->
                            Page.UserActionRequired.view helpers error

                        _ ->
                            section [ class "two-panes" ]
                                [ aside [ class "two-panes__menu" ]
                                    [ menu_item helpers model "Recents" DashboardPage
                                    , menu_item helpers model "Settings" SettingsPage
                                    ]
                                , if model.page == DashboardPage then
                                    Html.map DashboardMsg (Dashboard.view helpers model.dashboard)
                                  else if model.page == SettingsPage then
                                    Html.map SettingsMsg (Settings.view helpers model.settings)
                                  else
                                    div [] []
                                ]
                    , renderWarnings helpers model
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

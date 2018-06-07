module Main exposing (..)

import Html exposing (..)
import Dict exposing (Dict)
import Json.Decode as Json
import Time exposing (Time)
import Locale exposing (Helpers, Locale)
import Model exposing (..)
import Ports
import Window.Tray as Tray
import Window.Tray.Dashboard as Dashboard
import Window.Tray.Settings as Settings
import Window.Help as Help
import Window.Updater as Updater
import Window.Onboarding as Onboarding
import Window.Onboarding.Address as Address
import Window.Onboarding.Folder as Folder


main : Program Flags Model Msg
main =
    Html.programWithFlags
        { init = init
        , update = update
        , view = view
        , subscriptions = subscriptions
        }


type alias Flags =
    { page : String
    , folder : String
    , locale : String
    , locales : Json.Value
    , platform : String
    , version : String
    }



-- MODEL


type alias Model =
    { localeIdentifier : String
    , locales : Dict String Locale
    , window : Window

    -- TODO: Attach submodels to windows
    , onboarding : Onboarding.Model
    , tray : Tray.Model
    , updater : Updater.Model
    , help : Help.Model
    }


type Window
    = HelpWindow
    | OnboardingWindow
    | TrayWindow
    | UpdaterWindow


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

        window =
            case flags.page of
                "onboarding" ->
                    OnboardingWindow

                "help" ->
                    HelpWindow

                "dashboard" ->
                    TrayWindow

                "settings" ->
                    TrayWindow

                "updater" ->
                    UpdaterWindow

                -- Temporarily use the MsgMechanism to
                -- get to the 2Panes page.
                _ ->
                    OnboardingWindow

        trayPage =
            case flags.page of
                "settings" ->
                    Tray.SettingsPage

                _ ->
                    Tray.DashboardPage

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
            , locales = locales
            , window = window

            -- TODO: Attach submodels to windows
            , onboarding = Onboarding.init flags.folder flags.platform
            , tray = Tray.init trayPage flags.version platform
            , updater = Updater.init flags.version
            , help = Help.init
            }
    in
        ( model, Cmd.none )



-- UPDATE


type Msg
    = OnboardingMsg Onboarding.Msg
    | TrayMsg Tray.Msg
    | HelpMsg Help.Msg
    | UpdaterMsg Updater.Msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        OnboardingMsg subMsg ->
            let
                ( onboarding, cmd ) =
                    Onboarding.update subMsg model.onboarding
            in
                ( { model | onboarding = onboarding }
                , Cmd.map OnboardingMsg cmd
                )

        TrayMsg subMsg ->
            let
                ( tray, cmd ) =
                    Tray.update subMsg model.tray
            in
                ( { model | tray = tray }
                , Cmd.map TrayMsg cmd
                )

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
-- https://github.com/elm-lang/elm-compiler/issues/1367


subscriptions : Model -> Sub Msg
subscriptions model =
    Sub.batch
        -- TODO: Move subscriptions to the corresponding windows
        [ Ports.registrationError (OnboardingMsg << Onboarding.AddressMsg << Address.RegistrationError)
        , Ports.registrationDone (always (OnboardingMsg Onboarding.RegistrationDone))
        , Ports.folderError (OnboardingMsg << Onboarding.FolderMsg << Folder.SetError)
        , Ports.folder (OnboardingMsg << Onboarding.FolderMsg << Folder.FillFolder)
        , Ports.synchonization (TrayMsg << Tray.SyncStart)
        , Ports.newRelease (TrayMsg << Tray.SettingsMsg << Settings.NewRelease)
        , Ports.gototab (TrayMsg << Tray.GoToStrTab)
        , Time.every Time.second (TrayMsg << Tray.DashboardMsg << Dashboard.Tick)
        , Ports.transfer (TrayMsg << Tray.DashboardMsg << Dashboard.Transfer)
        , Ports.remove (TrayMsg << Tray.DashboardMsg << Dashboard.Remove)
        , Ports.diskSpace (TrayMsg << Tray.SettingsMsg << Settings.UpdateDiskSpace)
        , Ports.syncError (TrayMsg << Tray.SetError)
        , Ports.offline (TrayMsg << (always Tray.GoOffline))
        , Ports.remoteWarnings (TrayMsg << Tray.RemoteWarnings)
        , Ports.userActionRequired (TrayMsg << Tray.UserActionRequired)
        , Ports.buffering (TrayMsg << (always Tray.StartBuffering))
        , Ports.squashPrepMerge (TrayMsg << (always Tray.StartSquashPrepMerging))
        , Ports.updated (TrayMsg << (always Tray.Updated))
        , Ports.syncing (TrayMsg << Tray.StartSyncing)
        , Ports.mail (HelpMsg << Help.MailSent)
        , Ports.autolaunch (TrayMsg << Tray.SettingsMsg << Settings.AutoLaunchSet)
        , Ports.cancelUnlink (TrayMsg << (always (Tray.SettingsMsg Settings.CancelUnlink)))
        , Ports.updateDownloading (UpdaterMsg << Updater.UpdateDownloading)
        , Ports.updateError (UpdaterMsg << Updater.UpdateError)
        ]



-- VIEW


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
        case model.window of
            OnboardingWindow ->
                Html.map OnboardingMsg (Onboarding.view helpers model.onboarding)

            HelpWindow ->
                Html.map HelpMsg (Help.view helpers model.help)

            UpdaterWindow ->
                Html.map UpdaterMsg (Updater.view helpers model.updater)

            TrayWindow ->
                Html.map TrayMsg (Tray.view helpers model.tray)

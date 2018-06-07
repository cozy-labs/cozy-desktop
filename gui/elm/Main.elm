module Main exposing (..)

import Data.Platform exposing (Platform(..))
import Html exposing (..)
import Dict exposing (Dict)
import Json.Decode as Json
import Locale exposing (Helpers, Locale)
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
        [ Help.subscriptions model.help |> Sub.map HelpMsg
        , Onboarding.subscriptions model.onboarding |> Sub.map OnboardingMsg
        , Tray.subscriptions model.tray |> Sub.map TrayMsg
        , Updater.subscriptions model.updater |> Sub.map UpdaterMsg
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

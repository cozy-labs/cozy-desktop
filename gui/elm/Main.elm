module Main exposing
    ( Flags
    , Model
    , Msg(..)
    , currentLocale
    , debugLog
    , init
    , main
    , subscriptions
    , update
    , view
    )

import Browser
import Data.Platform as Platform exposing (Platform)
import Data.Window as Window exposing (Window)
import Dict exposing (Dict)
import Html exposing (..)
import I18n exposing (Helpers, Locale)
import Json.Decode as Json
import Window.Help as Help
import Window.Onboarding as Onboarding
import Window.Tray as Tray
import Window.Tray.Dashboard as Dashboard
import Window.Updater as Updater


main : Program Flags Model Msg
main =
    Browser.element
        { init = init
        , update = update
        , view = view
        , subscriptions = subscriptions
        }


type alias Flags =
    { hash : String
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


init : Flags -> ( Model, Cmd Msg )
init flags =
    let
        platform =
            Platform.fromName flags.platform

        model =
            { localeIdentifier = flags.locale
            , locales = I18n.decodeAll flags.locales
            , window = Window.fromHash flags.hash

            -- TODO: Attach submodels to windows
            , onboarding = Onboarding.init flags.folder flags.platform
            , tray = Tray.init flags.version platform
            , updater = Updater.init flags.version
            , help = Help.init
            }
    in
    ( model, Cmd.none )


currentLocale : Model -> Locale
currentLocale model =
    Dict.get model.localeIdentifier model.locales
        |> Maybe.withDefault I18n.defaultLocale



-- UPDATE


type Msg
    = OnboardingMsg Onboarding.Msg
    | TrayMsg Tray.Msg
    | HelpMsg Help.Msg
    | UpdaterMsg Updater.Msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case debugLog msg of
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


debugLog : Msg -> Msg
debugLog msg =
    case msg of
        -- Don't log ticks to prevent flooding
        TrayMsg (Tray.DashboardMsg (Dashboard.Tick _)) ->
            msg

        _ ->
            Debug.log "update" msg



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
        helpers =
            I18n.helpers (currentLocale model)
    in
    case model.window of
        Window.Onboarding ->
            Html.map OnboardingMsg (Onboarding.view helpers model.onboarding)

        Window.Help ->
            Html.map HelpMsg (Help.view helpers model.help)

        Window.Updater ->
            Html.map UpdaterMsg (Updater.view helpers model.updater)

        Window.Tray ->
            Html.map TrayMsg (Tray.view helpers model.tray)

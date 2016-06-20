port module Main exposing (..)

import Html exposing (Html)
import Html.App as Html
import Dict exposing (Dict)
import Json.Decode as Json
import Time exposing (Time)
import Helpers exposing (Locale)
import Wizard
import Address
import Password
import Folder
import TwoPanes
import Dashboard
import Settings
import Account
import Help
import Unlinked


main =
    Html.programWithFlags
        { init = init
        , update = update
        , view = view
        , subscriptions = subscriptions
        }



-- MODEL


type Page
    = WizardPage
    | TwoPanesPage
    | UnlinkedPage


type alias Model =
    { localeIdentifier : String
    , locales : Dict String Locale
    , page : Page
    , wizard : Wizard.Model
    , twopanes : TwoPanes.Model
    }


type alias Flags =
    { folder : String
    , locale : String
    , locales : Json.Value
    , version : String
    }


init : Flags -> ( Model, Cmd Msg )
init flags =
    let
        localeIdentifier =
            flags.locale

        locales =
            case
                Json.decodeValue (Json.dict (Json.dict Json.string)) flags.locales
            of
                Ok value ->
                    value

                Err _ ->
                    Dict.empty

        page =
            WizardPage

        wizard =
            Wizard.init flags.folder

        twopanes =
            TwoPanes.init flags.version

        model =
            Model localeIdentifier locales page wizard twopanes
    in
        ( model, Cmd.none )



-- UPDATE


type Msg
    = NoOp
    | WizardMsg Wizard.Msg
    | SyncStart ( String, String )
    | TwoPanesMsg TwoPanes.Msg
    | Unlink
    | Restart


port restart : Bool -> Cmd msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        WizardMsg msg' ->
            let
                ( wizard', cmd ) =
                    Wizard.update msg' model.wizard
            in
                ( { model | wizard = wizard' }, Cmd.map WizardMsg cmd )

        SyncStart info ->
            let
                ( twopanes', _ ) =
                    TwoPanes.update (TwoPanes.FillAddressAndDevice info) model.twopanes
            in
                ( { model | page = TwoPanesPage, twopanes = twopanes' }, Cmd.none )

        TwoPanesMsg msg' ->
            let
                ( twopanes', cmd ) =
                    TwoPanes.update msg' model.twopanes
            in
                ( { model | twopanes = twopanes' }, Cmd.map TwoPanesMsg cmd )

        Unlink ->
            ( { model | page = UnlinkedPage }, Cmd.none )

        Restart ->
            ( model, restart True )

        NoOp ->
            ( model, Cmd.none )



-- SUBSCRIPTIONS


port pong : (Maybe String -> msg) -> Sub msg


port registration : (Maybe String -> msg) -> Sub msg


port folder : (String -> msg) -> Sub msg


port synchonization : (( String, String ) -> msg) -> Sub msg


port gototab : (String -> msg) -> Sub msg


port offline : (Bool -> msg) -> Sub msg


port updated : (Bool -> msg) -> Sub msg


port transfer : (Dashboard.File -> msg) -> Sub msg


port remove : (Dashboard.File -> msg) -> Sub msg


port diskSpace : (Account.DiskSpace -> msg) -> Sub msg


port syncError : (String -> msg) -> Sub msg


port autolaunch : (Bool -> msg) -> Sub msg


port mail : (Maybe String -> msg) -> Sub msg



-- https://github.com/elm-lang/elm-compiler/issues/1367


port unlink : (Bool -> msg) -> Sub msg


subscriptions : Model -> Sub Msg
subscriptions model =
    Sub.batch
        [ pong (WizardMsg << Wizard.AddressMsg << Address.Pong)
        , registration (WizardMsg << Wizard.PasswordMsg << Password.Registered)
        , folder (WizardMsg << Wizard.FolderMsg << Folder.FillFolder)
        , synchonization SyncStart
        , gototab (TwoPanesMsg << TwoPanes.GoToStrTab)
        , Time.every Time.second (TwoPanesMsg << TwoPanes.DashboardMsg << Dashboard.Tick)
        , transfer (TwoPanesMsg << TwoPanes.DashboardMsg << Dashboard.Transfer)
        , remove (TwoPanesMsg << TwoPanes.DashboardMsg << Dashboard.Remove)
        , diskSpace (TwoPanesMsg << TwoPanes.AccountMsg << Account.UpdateDiskSpace)
        , syncError (TwoPanesMsg << TwoPanes.DashboardMsg << Dashboard.SetError)
        , offline (always (TwoPanesMsg (TwoPanes.DashboardMsg Dashboard.GoOffline)))
        , updated (always (TwoPanesMsg (TwoPanes.DashboardMsg Dashboard.Updated)))
        , mail (TwoPanesMsg << TwoPanes.HelpMsg << Help.MailSent)
        , autolaunch (TwoPanesMsg << TwoPanes.SettingsMsg << Settings.AutoLaunchSet)
        , unlink (always Unlink)
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
            Helpers.forLocale locale
    in
        case
            model.page
        of
            WizardPage ->
                Html.map WizardMsg (Wizard.view helpers model.wizard)

            TwoPanesPage ->
                Html.map TwoPanesMsg (TwoPanes.view helpers model.twopanes)

            UnlinkedPage ->
                Html.map (\_ -> Restart) (Unlinked.view helpers)

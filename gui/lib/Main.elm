port module Main exposing (..)

import Html exposing (Html)
import Dict exposing (Dict)
import Json.Decode as Json
import Time exposing (Time)
import Helpers exposing (Locale)
import Wizard
import Address
import Folder
import TwoPanes
import Dashboard
import Settings
import Account
import Help
import Unlinked
import Revoked


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
    | RevokedPage


type alias Model =
    { localeIdentifier : String
    , locales : Dict String Locale
    , page : Page
    , wizard : Wizard.Model
    , twopanes : TwoPanes.Model
    , revoked : Revoked.Model
    }


type alias Flags =
    { folder : String
    , locale : String
    , locales : Json.Value
    , platform : String
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
            Wizard.init flags.folder flags.platform

        twopanes =
            TwoPanes.init flags.version

        revoked =
            Revoked.init

        model =
            Model localeIdentifier locales page wizard twopanes revoked
    in
        ( model, Cmd.none )



-- UPDATE


type Msg
    = NoOp
    | WizardMsg Wizard.Msg
    | SyncStart ( String, String )
    | TwoPanesMsg TwoPanes.Msg
    | Unlink
    | Revoked
    | RevokedMsg Revoked.Msg
    | Restart


port restart : Bool -> Cmd msg


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
                ( twopanes, _ ) =
                    TwoPanes.update (TwoPanes.FillAddressAndDevice info) model.twopanes
            in
                ( { model | page = TwoPanesPage, twopanes = twopanes }, Cmd.none )

        TwoPanesMsg subMsg ->
            let
                ( twopanes, cmd ) =
                    TwoPanes.update subMsg model.twopanes
            in
                ( { model | twopanes = twopanes }, Cmd.map TwoPanesMsg cmd )

        Unlink ->
            ( { model | page = UnlinkedPage }, Cmd.none )

        Revoked ->
            ( { model | page = RevokedPage }, Cmd.none )

        Restart ->
            ( model, restart True )

        RevokedMsg subMsg ->
            let
                ( revoked, cmd ) =
                    Revoked.update subMsg model.revoked
            in
                ( { model | revoked = revoked }, Cmd.map RevokedMsg cmd )

        NoOp ->
            ( model, Cmd.none )



-- SUBSCRIPTIONS


port registrationError : (String -> msg) -> Sub msg


port registrationDone : (Bool -> msg) -> Sub msg


port folderError : (String -> msg) -> Sub msg


port folder : (String -> msg) -> Sub msg


port synchonization : (( String, String ) -> msg) -> Sub msg


port newRelease : (( String, String ) -> msg) -> Sub msg


port gototab : (String -> msg) -> Sub msg


port offline : (Bool -> msg) -> Sub msg


port updated : (Bool -> msg) -> Sub msg


port syncing : (Bool -> msg) -> Sub msg


port transfer : (Dashboard.File -> msg) -> Sub msg


port remove : (Dashboard.File -> msg) -> Sub msg


port diskSpace : (Account.DiskSpace -> msg) -> Sub msg


port syncError : (String -> msg) -> Sub msg


port autolaunch : (Bool -> msg) -> Sub msg


port mail : (Maybe String -> msg) -> Sub msg



-- https://github.com/elm-lang/elm-compiler/issues/1367


port cancelUnlink : (Bool -> msg) -> Sub msg


port unlink : (Bool -> msg) -> Sub msg


port revoked : (Bool -> msg) -> Sub msg


subscriptions : Model -> Sub Msg
subscriptions model =
    Sub.batch
        [ registrationError (WizardMsg << Wizard.AddressMsg << Address.RegistrationError)
        , registrationDone (always (WizardMsg Wizard.RegistrationDone))
        , folderError (WizardMsg << Wizard.FolderMsg << Folder.SetError)
        , folder (WizardMsg << Wizard.FolderMsg << Folder.FillFolder)
        , synchonization SyncStart
        , newRelease (TwoPanesMsg << TwoPanes.SettingsMsg << Settings.NewRelease)
        , gototab (TwoPanesMsg << TwoPanes.GoToStrTab)
        , Time.every Time.second (TwoPanesMsg << TwoPanes.DashboardMsg << Dashboard.Tick)
        , transfer (TwoPanesMsg << TwoPanes.DashboardMsg << Dashboard.Transfer)
        , remove (TwoPanesMsg << TwoPanes.DashboardMsg << Dashboard.Remove)
        , diskSpace (TwoPanesMsg << TwoPanes.AccountMsg << Account.UpdateDiskSpace)
        , syncError (TwoPanesMsg << TwoPanes.DashboardMsg << Dashboard.SetError)
        , offline (always (TwoPanesMsg (TwoPanes.DashboardMsg Dashboard.GoOffline)))
        , updated (always (TwoPanesMsg (TwoPanes.DashboardMsg Dashboard.Updated)))
        , syncing (always (TwoPanesMsg (TwoPanes.DashboardMsg Dashboard.Syncing)))
        , mail (TwoPanesMsg << TwoPanes.HelpMsg << Help.MailSent)
        , autolaunch (TwoPanesMsg << TwoPanes.SettingsMsg << Settings.AutoLaunchSet)
        , cancelUnlink (always (TwoPanesMsg (TwoPanes.AccountMsg Account.CancelUnlink)))
        , unlink (always Unlink)
        , revoked (always Revoked)
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

            RevokedPage ->
                Html.map RevokedMsg (Revoked.view helpers model.revoked)

port module Main exposing (..)

import Html exposing (Html)
import Html.App as Html
import Time exposing (Time)
import Wizard
import Address
import Password
import Folder
import TwoPanes
import Dashboard
import Settings
import Help
import Unlinked


main =
    Html.program
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
    { page : Page
    , wizard : Wizard.Model
    , twopanes : TwoPanes.Model
    }


init : ( Model, Cmd Msg )
init =
    let
        page =
            WizardPage

        wizard =
            Wizard.init

        twopanes =
            TwoPanes.init

        model =
            Model page wizard twopanes
    in
        ( model, Cmd.none )



-- UPDATE


type Msg
    = NoOp
    | WizardMsg Wizard.Msg
    | SyncStart String
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

        SyncStart address ->
            let
                ( twopanes', _ ) =
                    TwoPanes.update (TwoPanes.FillAddress address) model.twopanes
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


port synchonization : (String -> msg) -> Sub msg


port gototab : (String -> msg) -> Sub msg


port offline : (Bool -> msg) -> Sub msg


port updated : (Bool -> msg) -> Sub msg


port transfer : (Dashboard.File -> msg) -> Sub msg


port remove : (Dashboard.File -> msg) -> Sub msg


port diskSpace : (Dashboard.DiskSpace -> msg) -> Sub msg


port syncError : (String -> msg) -> Sub msg


port version : (String -> msg) -> Sub msg


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
        , diskSpace (TwoPanesMsg << TwoPanes.DashboardMsg << Dashboard.UpdateDiskSpace)
        , syncError (TwoPanesMsg << TwoPanes.DashboardMsg << Dashboard.SetError)
        , offline (always (TwoPanesMsg (TwoPanes.DashboardMsg Dashboard.GoOffline)))
        , updated (always (TwoPanesMsg (TwoPanes.DashboardMsg Dashboard.Updated)))
        , mail (TwoPanesMsg << TwoPanes.HelpMsg << Help.MailSent)
        , version (TwoPanesMsg << TwoPanes.SettingsMsg << Settings.SetVersion)
        , autolaunch (TwoPanesMsg << TwoPanes.SettingsMsg << Settings.AutoLaunchSet)
        , unlink (always Unlink)
        ]



-- VIEW


view : Model -> Html Msg
view model =
    case
        model.page
    of
        WizardPage ->
            Html.map WizardMsg (Wizard.view model.wizard)

        TwoPanesPage ->
            Html.map TwoPanesMsg (TwoPanes.view model.twopanes)

        UnlinkedPage ->
            Html.map (\_ -> Restart) Unlinked.view

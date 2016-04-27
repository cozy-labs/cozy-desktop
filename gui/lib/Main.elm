module Main (..) where

import StartApp
import Effects exposing (Effects, Never)
import Html exposing (Html)
import Task exposing (Task)
import Time exposing (Time)
import Wizard
import TwoPanes
import Dashboard exposing (File)


-- MODEL


type Page
  = WizardPage
  | TwoPanesPage


type alias Model =
  { page : Page
  , wizard : Wizard.Model
  , twopanes : TwoPanes.Model
  }


init : ( Model, Effects Action )
init =
  let
    page =
      WizardPage

    wizard =
      Wizard.init

    twopanes =
      TwoPanes.init version

    model =
      Model page wizard twopanes
  in
    ( model, Effects.none )



-- UPDATE


type Action
  = NoOp
  | WizardAction Wizard.Action
  | WizardFinished String
  | TwoPanesAction TwoPanes.Action
  | GoToTab String
  | Unlink


update : Action -> Model -> ( Model, Effects Action )
update action model =
  case action of
    NoOp ->
      ( model, Effects.none )

    WizardAction action' ->
      let
        ( wizard', effects ) =
          Wizard.update action' model.wizard
      in
        ( { model | wizard = wizard' }, Effects.map WizardAction effects )

    WizardFinished address ->
      let
        ( twopanes', effects ) =
          TwoPanes.update (TwoPanes.FillAddress address) model.twopanes

        model' =
          { model | twopanes = twopanes', page = TwoPanesPage }
      in
        ( model', Effects.map TwoPanesAction effects )

    TwoPanesAction action' ->
      let
        ( twopanes', effects ) =
          TwoPanes.update action' model.twopanes
      in
        ( { model | twopanes = twopanes' }, Effects.map TwoPanesAction effects )

    GoToTab tab' ->
      let
        tab =
          case
            tab'
          of
            "help" ->
              TwoPanes.HelpTab

            "settings" ->
              TwoPanes.SettingsTab

            _ ->
              TwoPanes.DashboardTab

        ( twopanes', effects ) =
          TwoPanes.update (TwoPanes.GoToTab tab) model.twopanes
      in
        ( { model | twopanes = twopanes' }, Effects.map TwoPanesAction effects )

    Unlink ->
      init



-- VIEW


view : Signal.Address Action -> Model -> Html
view address model =
  if model.page == WizardPage then
    let
      address' =
        Signal.forwardTo address WizardAction
    in
      Wizard.view address' model.wizard
  else
    let
      address' =
        Signal.forwardTo address TwoPanesAction
    in
      TwoPanes.view address' model.twopanes


app : StartApp.App Model
app =
  StartApp.start
    { init = init
    , inputs =
        [ Signal.map (TwoPanesAction << TwoPanes.Tick) everySecond
        , Signal.map (WizardAction << Wizard.pong) pong
        , Signal.map (WizardAction << Wizard.registration) registration
        , Signal.map (WizardAction << Wizard.folderChosen) folder
        , Signal.map WizardFinished synchonization
        , Signal.map (always Unlink) unlink
        , Signal.map (TwoPanesAction << TwoPanes.Mail) mail
        , Signal.map (TwoPanesAction << TwoPanes.Transfer) transfer
        , Signal.map (TwoPanesAction << TwoPanes.Remove) remove
        , Signal.map (always (TwoPanesAction TwoPanes.Updated)) updated
        , Signal.map (TwoPanesAction << TwoPanes.SetAutoLaunch) autolaunch
        , Signal.map GoToTab gototab
        ]
    , update = update
    , view = view
    }


main : Signal Html
main =
  app.html


everySecond : Signal Time
everySecond =
  Time.every (1 * Time.second)


port runner : Signal (Task Never ())
port runner =
  app.tasks


port focus : Signal String
port focus =
  Wizard.focus |> .signal


port pong : Signal (Maybe String)
port pingCozy : Signal String
port pingCozy =
  Wizard.pingCozy |> .signal


port registration : Signal (Maybe String)
port registerRemote : Signal ( String, String )
port registerRemote =
  Wizard.registerRemote |> .signal


port folder : Signal String
port chooseFolder : Signal ()
port chooseFolder =
  Wizard.chooseFolder |> .signal


port synchonization : Signal String
port startSync : Signal String
port startSync =
  Wizard.startSync |> .signal


port unlink : Signal ()
port unlinkCozy : Signal ()
port unlinkCozy =
  TwoPanes.unlinkCozy |> .signal


port mail : Signal (Maybe String)
port sendMail : Signal String
port sendMail =
  TwoPanes.sendMail |> .signal


port autolaunch : Signal Bool
port autoLauncher : Signal Bool
port autoLauncher =
  TwoPanes.autoLauncher |> .signal


port transfer : Signal File
port remove : Signal File
port updated : Signal ()
port gototab : Signal String
port version : String

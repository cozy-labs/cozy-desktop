module Main (..) where

import StartApp
import Html exposing (Html)
import Effects exposing (Effects, Never)
import Task exposing (Task)
import Wizard
import TwoPanes


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

    WizardFinished address' ->
      let
        twopanes =
          model.twopanes

        twopanes' =
          { twopanes | address = address' }
      in
        ( { model | page = TwoPanesPage, twopanes = twopanes' }, Effects.none )

    TwoPanesAction action' ->
      let
        ( twopanes', effects ) =
          TwoPanes.update action' model.twopanes
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
        [ Signal.map (WizardAction << Wizard.pong) pong
        , Signal.map (WizardAction << Wizard.registration) registration
        , Signal.map (WizardAction << Wizard.folderChosen) folder
        , Signal.map WizardFinished synchonization
        , Signal.map (always Unlink) unlink
        ]
    , update = update
    , view = view
    }


main : Signal Html
main =
  app.html


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


port version : String

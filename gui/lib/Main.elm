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
  | TwoPanesAction TwoPanes.Action


update : Action -> Model -> ( Model, Effects Action )
update action model =
  case action of
    NoOp ->
      ( model, Effects.none )

    WizardAction action' ->
      if action' == Wizard.WizardFinished then
        ( { model | page = TwoPanesPage }, Effects.none )
      else
        let
          ( wizard', effects ) =
            Wizard.update action' model.wizard
        in
          ( { model | wizard = wizard' }, Effects.map WizardAction effects )

    TwoPanesAction action' ->
      let
        ( twopanes', effects ) =
          TwoPanes.update action' model.twopanes
      in
        ( { model | twopanes = twopanes' }, Effects.map TwoPanesAction effects )



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
        [ Signal.map (WizardAction << Wizard.folderChosen) folder
        , Signal.map (always (WizardAction Wizard.registered)) registration
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


port folder : Signal String
port chooseFolder : Signal ()
port chooseFolder =
  Wizard.chooseFolder |> .signal


port registration : Signal ()
port registerRemote : Signal ( String, String )
port registerRemote =
  Wizard.registerRemote |> .signal


port startSync : Signal String
port startSync =
  Wizard.startSync |> .signal


port version : String

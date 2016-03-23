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


init : ( Model, Effects Wizard.Action )
init =
  let
    model =
      Model WizardPage Wizard.init TwoPanes.init
  in
    ( model, Effects.none )



-- UPDATE


update : Wizard.Action -> Model -> ( Model, Effects Wizard.Action )
update action model =
  case action of
    Wizard.StartSync ->
      ( { model | page = TwoPanesPage }, Effects.none )

    _ ->
      let
        ( wizard', effects ) =
          Wizard.update action model.wizard
      in
        ( { model | wizard = wizard' }, effects )



-- VIEW


view : Signal.Address Wizard.Action -> Model -> Html
view address model =
  if model.page == WizardPage then
    Wizard.view address model.wizard
  else
    TwoPanes.view address model.twopanes


app : StartApp.App Model
app =
  StartApp.start
    { init = init
    , inputs = []
    , update = update
    , view = view
    }


main : Signal Html
main =
  app.html


port runner : Signal (Task Never ())
port runner =
  app.tasks

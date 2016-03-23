module TwoPanes (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
import Effects exposing (Effects)
import Wizard


-- MODEL


type Tab
  = DashboardTab
  | SettingsTab
  | AccountTab
  | HelpTab


type alias Model =
  { tab : Tab }


init : Model
init =
  { tab = DashboardTab }



-- UPDATE


type Action
  = NoOp


update : Action -> Model -> ( Model, Effects Action )
update action model =
  case action of
    _ ->
      ( model, Effects.none )



-- VIEW


view : Signal.Address Wizard.Action -> Model -> Html
view address model =
  div [ id "two-panes" ] [ text "Work in progress" ]

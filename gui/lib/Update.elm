module Update (..) where

import Models exposing (..)
import Actions exposing (..)
import Effects exposing (Effects)


update : Action -> AppModel -> ( AppModel, Effects Action )
update action model =
  case action of
    NoOp ->
      ( model, Effects.none )

    NextStep ->
      ( { model | step = AddressStep }, Effects.none )

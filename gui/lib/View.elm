module View (..) where

import Html exposing (..)
import Actions exposing (..)
import Models exposing (..)
import Welcome
import Address


view : Signal.Address Action -> AppModel -> Html
view address model =
  case
    model.step
  of
    WelcomeStep ->
      Welcome.view address model

    AddressStep ->
      Address.view address model

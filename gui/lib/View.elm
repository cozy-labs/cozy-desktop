module View (..) where

import Html exposing (..)
import Update exposing (Action)
import Models exposing (..)
import Welcome
import Address
import Password
import Folder
import TwoPanes


view : Signal.Address Action -> AppModel -> Html
view address model =
  case
    model.page
  of
    WelcomePage ->
      Welcome.view address model

    AddressPage ->
      Address.view address model

    PasswordPage ->
      Password.view address model

    FolderPage ->
      Folder.view address model

    MainPage ->
      TwoPanes.view address model

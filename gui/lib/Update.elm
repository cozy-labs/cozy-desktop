module Update (..) where

import Effects exposing (Effects)
import Models exposing (..)


type Action
  = NoOp
  | GoToAddressForm
  | FillAddress String
  | GoToPasswordForm
  | FillPassword String
  | AddDevice
  | FillFolder String
  | StartSync


update : Action -> AppModel -> ( AppModel, Effects Action )
update action model =
  case action of
    NoOp ->
      ( model, Effects.none )

    GoToAddressForm ->
      ( { model | page = AddressPage }, Effects.none )

    FillAddress address' ->
      ( { model | address = address' }, Effects.none )

    GoToPasswordForm ->
      ( { model | page = PasswordPage }, Effects.none )

    FillPassword password' ->
      ( { model | password = password' }, Effects.none )

    AddDevice ->
      ( { model | page = FolderPage }, Effects.none )

    FillFolder folder' ->
      ( { model | folder = folder' }, Effects.none )

    StartSync ->
      ( { model | page = MainPage }, Effects.none )

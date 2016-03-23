module Wizard (..) where

import Html exposing (..)
import Effects exposing (Effects)
import Welcome
import Address
import Password
import Folder


-- MODEL


type Page
  = WelcomePage
  | AddressPage
  | PasswordPage
  | FolderPage


type alias Model =
  { page : Page
  , address : Address.Model
  , password : Password.Model
  , folder : Folder.Model
  }


init : Model
init =
  { page = WelcomePage
  , address = Address.init
  , password = Password.init
  , folder = Folder.init
  }



-- UPDATE


type Action
  = NoOp
  | GoToAddressForm
  | UpdateAddress Address.Action
  | GoToPasswordForm
  | UpdatePassword Password.Action
  | AddDevice
  | UpdateFolder Folder.Action
  | StartSync


update : Action -> Model -> ( Model, Effects Action )
update action model =
  case action of
    NoOp ->
      ( model, Effects.none )

    GoToAddressForm ->
      ( { model | page = AddressPage }, Effects.none )

    UpdateAddress action' ->
      let
        address' =
          Address.update action' model.address
      in
        ( { model | address = address' }, Effects.none )

    GoToPasswordForm ->
      if model.address.address == "" then
        let
          address' =
            { address = "", error = True }
        in
          ( { model | address = address' }, Effects.none )
      else
        let
          password' =
            model.password

          password'' =
            { password' | address = model.address.address }
        in
          ( { model | page = PasswordPage, password = password'' }, Effects.none )

    UpdatePassword action' ->
      let
        password' =
          Password.update action' model.password
      in
        ( { model | password = password' }, Effects.none )

    AddDevice ->
      if model.password.password == "" then
        let
          password' =
            { password = "", address = model.address.address, error = True }
        in
          ( { model | password = password' }, Effects.none )
      else
        ( { model | page = FolderPage }, Effects.none )

    UpdateFolder action' ->
      let
        folder' =
          Folder.update action' model.folder
      in
        ( { model | folder = folder' }, Effects.none )

    StartSync ->
      ( { model | page = WelcomePage }, Effects.none )



-- VIEW


view : Signal.Address Action -> Model -> Html
view address model =
  case
    model.page
  of
    WelcomePage ->
      let
        context =
          Welcome.Context
            (Signal.forwardTo address (always (GoToAddressForm)))
      in
        Welcome.view context

    AddressPage ->
      let
        context =
          Address.Context
            (Signal.forwardTo address UpdateAddress)
            (Signal.forwardTo address (always (GoToPasswordForm)))
      in
        Address.view context model.address

    PasswordPage ->
      let
        context =
          Password.Context
            (Signal.forwardTo address UpdatePassword)
            (Signal.forwardTo address (always (AddDevice)))
            (Signal.forwardTo address (always (GoToAddressForm)))
      in
        Password.view context model.password

    FolderPage ->
      let
        context =
          Folder.Context
            (Signal.forwardTo address UpdateFolder)
            (Signal.forwardTo address (always (StartSync)))
      in
        Folder.view context model.folder

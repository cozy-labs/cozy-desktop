module Wizard (..) where

import Html exposing (..)
import Html.Attributes exposing (..)
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
  | DeviceRegistered
  | UpdateFolder Folder.Action
  | StartSync
  | WizardFinished


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
        let
          url =
            model.address.address

          password =
            model.password.password

          task =
            Signal.send registerRemote.address ( url, password )

          effect =
            Effects.map (always NoOp) (Effects.task task)
        in
          ( model, effect )

    DeviceRegistered ->
      ( { model | page = FolderPage }, Effects.none )

    UpdateFolder action' ->
      let
        folder' =
          Folder.update action' model.folder
      in
        ( { model | folder = folder' }, Effects.none )

    StartSync ->
      if model.folder.folder == "" then
        let
          folder' =
            { folder = "", error = True }
        in
          ( { model | folder = folder' }, Effects.none )
      else
        let
          folder =
            model.folder.folder

          task =
            Signal.send startSync.address folder

          effect =
            Effects.map (always WizardFinished) (Effects.task task)
        in
          ( model, effect )

    WizardFinished ->
      ( model, Effects.none )


folderChosen : String -> Action
folderChosen =
  UpdateFolder << Folder.FillFolder


chooseFolder : Signal.Mailbox ()
chooseFolder =
  Signal.mailbox ()


registered : Action
registered =
  DeviceRegistered


registerRemote : Signal.Mailbox ( String, String )
registerRemote =
  Signal.mailbox ( "", "" )


startSync : Signal.Mailbox String
startSync =
  Signal.mailbox ""



-- VIEW


view : Signal.Address Action -> Model -> Html
view address model =
  let
    welcomeContext =
      Welcome.Context
        (Signal.forwardTo address (always (GoToAddressForm)))

    welcomeView =
      Welcome.view welcomeContext

    addressContext =
      Address.Context
        (Signal.forwardTo address UpdateAddress)
        (Signal.forwardTo address (always (GoToPasswordForm)))

    addressView =
      Address.view addressContext model.address

    passwordContext =
      Password.Context
        (Signal.forwardTo address UpdatePassword)
        (Signal.forwardTo address (always (AddDevice)))
        (Signal.forwardTo address (always (GoToAddressForm)))

    passwordView =
      Password.view passwordContext model.password

    folderContext =
      Folder.Context
        chooseFolder.address
        (Signal.forwardTo address (always (StartSync)))

    folderView =
      Folder.view folderContext model.folder
  in
    section
      [ classList
          [ ( "wizard", True )
          , ( "on-step-welcome", model.page == WelcomePage )
          , ( "on-step-address", model.page == AddressPage )
          , ( "on-step-password", model.page == PasswordPage )
          , ( "on-step-folder", model.page == FolderPage )
          ]
      ]
      [ welcomeView
      , addressView
      , passwordView
      , folderView
      ]

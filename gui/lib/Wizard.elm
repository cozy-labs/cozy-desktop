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
  | SetAddress (Maybe String)
    -- String is the address
  | UpdatePassword Password.Action
  | AddDevice
  | Register (Maybe String)
    -- String is an error
  | UpdateFolder Folder.Action
  | StartSync


update : Action -> Model -> ( Model, Effects Action )
update action model =
  case action of
    NoOp ->
      ( model, Effects.none )

    GoToAddressForm ->
      let
        task =
          Signal.send focus.address ".wizard__address"

        effect =
          Effects.map (always NoOp) (Effects.task task)
      in
        ( { model | page = AddressPage }, effect )

    UpdateAddress action' ->
      let
        address' =
          Address.update action' model.address

        password' =
          Password.update (Password.SetError "") model.password
      in
        ( { model | address = address', password = password' }, Effects.none )

    GoToPasswordForm ->
      if model.address.address == "" then
        let
          address' =
            { address = ""
            , error = "You don't have filled the address!"
            }

          task =
            Signal.send focus.address ".wizard__address"

          effect =
            Effects.map (always NoOp) (Effects.task task)
        in
          ( { model | address = address' }, effect )
      else
        let
          url =
            model.address.address

          task =
            Signal.send pingCozy.address url

          effect =
            Effects.map (always NoOp) (Effects.task task)
        in
          ( model, effect )

    SetAddress Nothing ->
      let
        address' =
          { address = model.address.address
          , error = "No cozy instance at this address!"
          }
      in
        ( { model | address = address' }, Effects.none )

    SetAddress (Just address') ->
      let
        password' =
          model.password

        password'' =
          { password' | address = address' }

        task =
          Signal.send focus.address ".wizard__password"

        effect =
          Effects.map (always NoOp) (Effects.task task)
      in
        ( { model | page = PasswordPage, password = password'' }, effect )

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
            { password = ""
            , address = model.address.address
            , error = "You don't have filled the password!"
            }

          task =
            Signal.send focus.address ".wizard__password"

          effect =
            Effects.map (always NoOp) (Effects.task task)
        in
          ( { model | password = password' }, effect )
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

    Register (Just error) ->
      let
        password' =
          Password.update (Password.SetError error) model.password
      in
        ( { model | password = password' }, Effects.none )

    Register Nothing ->
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
            Effects.map (always NoOp) (Effects.task task)
        in
          ( model, effect )


focus : Signal.Mailbox String
focus =
  Signal.mailbox ""


pong : Maybe String -> Action
pong =
  SetAddress


pingCozy : Signal.Mailbox String
pingCozy =
  Signal.mailbox ""


registration : Maybe String -> Action
registration =
  Register


registerRemote : Signal.Mailbox ( String, String )
registerRemote =
  Signal.mailbox ( "", "" )


folderChosen : String -> Action
folderChosen =
  UpdateFolder << Folder.FillFolder


chooseFolder : Signal.Mailbox ()
chooseFolder =
  Signal.mailbox ()


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

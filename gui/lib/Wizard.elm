module Wizard exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Focus exposing (focus)
import Helpers exposing (Helpers)
import Welcome
import Address
import Folder


-- MODEL


type Page
    = WelcomePage
    | AddressPage
    | FolderPage


type alias Model =
    { page : Page
    , address : Address.Model
    , folder : Folder.Model
    }


init : String -> String -> Model
init folder platform =
    { page = WelcomePage
    , address = Address.init platform
    , folder = Folder.init folder
    }



-- UPDATE


type Msg
    = NoOp
    | WelcomeMsg Welcome.Msg
    | AddressMsg Address.Msg
    | RegistrationDone
    | FolderMsg Folder.Msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        NoOp ->
            ( model, Cmd.none )

        WelcomeMsg subMsg ->
            case
                subMsg
            of
                Welcome.NextPage ->
                    ( { model | page = AddressPage }, focus ".wizard__address" )

        AddressMsg subMsg ->
            let
                ( address, cmd ) =
                    Address.update subMsg model.address
            in
                ( { model | address = address }, Cmd.map AddressMsg cmd )

        RegistrationDone ->
            ( { model | page = FolderPage }, Cmd.none )

        FolderMsg subMsg ->
            let
                ( folder, cmd ) =
                    Folder.update subMsg model.folder
            in
                ( { model | folder = folder }, Cmd.map FolderMsg cmd )



-- VIEW


view : Helpers -> Model -> Html Msg
view helpers model =
    let
        welcomeView =
            Html.map WelcomeMsg (Welcome.view helpers)

        addressView =
            Html.map AddressMsg (Address.view helpers model.address)

        folderView =
            Html.map FolderMsg (Folder.view helpers model.folder)
    in
        section
            [ classList
                [ ( "wizard", True )
                , ( "on-step-welcome", model.page == WelcomePage )
                , ( "on-step-address", model.page == AddressPage )
                , ( "on-step-folder", model.page == FolderPage )
                ]
            ]
            [ welcomeView
            , addressView
            , folderView
            ]

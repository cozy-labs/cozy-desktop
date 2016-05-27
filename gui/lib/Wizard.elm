module Wizard exposing (..)

import Html exposing (..)
import Html.App as Html
import Html.Attributes exposing (..)
import Focus exposing (focus)
import Helpers exposing (Helpers)
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


init : String -> Model
init folder' =
    { page = WelcomePage
    , address = Address.init
    , password = Password.init
    , folder = Folder.init folder'
    }



-- UPDATE


type Msg
    = NoOp
    | WelcomeMsg Welcome.Msg
    | AddressMsg Address.Msg
    | PasswordMsg Password.Msg
    | FolderMsg Folder.Msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        NoOp ->
            ( model, Cmd.none )

        WelcomeMsg msg' ->
            case
                msg'
            of
                Welcome.NextPage ->
                    ( { model | page = AddressPage }, focus ".wizard__address" )

        AddressMsg msg' ->
            let
                ( address', cmd, nav ) =
                    Address.update msg' model.address
            in
                case
                    nav
                of
                    Nothing ->
                        let
                            ( password', _, _ ) =
                                Password.update (Password.SetError "") model.password

                            model' =
                                { model | address = address', password = password' }
                        in
                            ( model', Cmd.map AddressMsg cmd )

                    Just address'' ->
                        let
                            ( password', _, _ ) =
                                Password.update (Password.FillAddress address'') model.password

                            model' =
                                { model | address = address', password = password', page = PasswordPage }

                            cmd' =
                                focus ".wizard__password"
                        in
                            ( model', cmd' )

        PasswordMsg msg' ->
            let
                ( password', cmd, nav ) =
                    Password.update msg' model.password
            in
                case
                    nav
                of
                    Password.NextPage ->
                        ( { model | password = password', page = FolderPage }, Cmd.none )

                    Password.PrevPage ->
                        ( { model | password = password', page = AddressPage }, Cmd.none )

                    Password.None ->
                        ( { model | password = password' }, Cmd.map PasswordMsg cmd )

        FolderMsg msg' ->
            let
                ( folder', cmd ) =
                    Folder.update msg' model.folder
            in
                ( { model | folder = folder' }, Cmd.map FolderMsg cmd )



-- VIEW


view : Helpers -> Model -> Html Msg
view helpers model =
    let
        welcomeView =
            Html.map WelcomeMsg (Welcome.view helpers)

        addressView =
            Html.map AddressMsg (Address.view helpers model.address)

        passwordView =
            Html.map PasswordMsg (Password.view helpers model.password)

        folderView =
            Html.map FolderMsg (Folder.view helpers model.folder)
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

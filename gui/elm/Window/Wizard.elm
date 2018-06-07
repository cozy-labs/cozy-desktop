module Window.Wizard exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Locale exposing (Helpers)
import Ports
import Window.Wizard.Address as Address
import Window.Wizard.Folder as Folder
import Window.Wizard.Welcome as Welcome


-- MODEL


type Page
    = WelcomePage
    | AddressPage
    | FolderPage


type alias Model =
    { page : Page
    , platform : String
    , address : Address.Model
    , folder : Folder.Model
    }


init : String -> String -> Model
init folder platform =
    { page = WelcomePage
    , platform = platform
    , address = Address.init
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
                    ( { model | page = AddressPage }
                    , Ports.focus ".wizard__address"
                    )

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
    section
        [ classList
            [ ( "wizard", True )
            , ( "on-step-welcome", model.page == WelcomePage )
            , ( "on-step-address", model.page == AddressPage )
            , ( "on-step-folder", model.page == FolderPage )
            ]
        ]
        [ Html.map WelcomeMsg (Welcome.view helpers model.platform)
        , Html.map AddressMsg (Address.view helpers model.address)
        , Html.map FolderMsg (Folder.view helpers model.folder)
        ]

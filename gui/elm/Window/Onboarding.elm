module Window.Onboarding exposing
    ( Model
    , Msg(..)
    , Page(..)
    , init
    , subscriptions
    , update
    , view
    )

import Data.SyncConfig as SyncConfig exposing (SyncConfig)
import Html exposing (..)
import Html.Attributes exposing (..)
import I18n exposing (Helpers)
import Ports
import Window.Onboarding.Address as Address
import Window.Onboarding.Context as Context exposing (Context)
import Window.Onboarding.Folder as Folder
import Window.Onboarding.Welcome as Welcome



-- MODEL


type Page
    = WelcomePage
    | AddressPage
    | FolderPage


type alias Model =
    { page : Page
    , context : Context
    }


init : String -> String -> Model
init defaultSyncPath platform =
    { page = WelcomePage
    , context = Context.init platform defaultSyncPath
    }



-- UPDATE


type Msg
    = WelcomeMsg Welcome.Msg
    | AddressMsg Address.Msg
    | RegistrationDone SyncConfig
    | FolderMsg Folder.Msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
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
                ( context, cmd ) =
                    Address.update subMsg model.context
            in
            ( { model | context = context }, Cmd.map AddressMsg cmd )

        RegistrationDone syncConfig ->
            ( { model
                | page = FolderPage
                , context = Context.setSyncConfig model.context syncConfig
              }
            , Cmd.none
            )

        FolderMsg subMsg ->
            let
                ( context, cmd ) =
                    Folder.update subMsg model.context
            in
            ( { model | context = context }, cmd )



-- SUBSCRIPTIONS


subscriptions : Model -> Sub Msg
subscriptions model =
    Sub.batch
        [ Ports.registrationError (AddressMsg << Address.RegistrationError)
        , SyncConfig.gotSyncConfig RegistrationDone
        , Ports.folderError (FolderMsg << Folder.SetError)
        , Ports.folder (FolderMsg << Folder.FillFolder)
        ]



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
        [ Html.map WelcomeMsg (Welcome.view helpers model.context)
        , Html.map AddressMsg (Address.view helpers model.context)
        , Html.map FolderMsg (Folder.view helpers model.context)
        ]

port module Window.Onboarding exposing
    ( Model
    , Msg(..)
    , Page(..)
    , init
    , subscriptions
    , update
    , view
    )

import Data.OAuthConfig as OAuthConfig exposing (OAuthConfig)
import Data.SyncConfig as SyncConfig exposing (SyncConfig)
import Html exposing (..)
import Html.Attributes exposing (..)
import I18n exposing (Helpers)
import Ports
import Time
import Window.Onboarding.Address as Address
import Window.Onboarding.Context as Context exposing (Context)
import Window.Onboarding.Email as Email
import Window.Onboarding.Folder as Folder
import Window.Onboarding.OAuth as OAuth
import Window.Onboarding.Welcome as Welcome



-- MODEL


type Page
    = WelcomePage
    | EmailPage
    | AddressPage
    | OAuthPage
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
    | EmailMsg Email.Msg
    | AddressMsg Address.Msg
    | OAuthMsg OAuth.Msg
    | LoginWithCustomServer String
    | RegistrationDone SyncConfig
    | RegistrationError String
    | FolderMsg Folder.Msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        WelcomeMsg subMsg ->
            case subMsg of
                Welcome.LoginWithTwake ->
                    let
                        ( context, cmd ) =
                            OAuth.startLogin model.context
                    in
                    ( { model | context = context, page = OAuthPage }
                    , cmd
                    )

                Welcome.LoginWithCustomServer ->
                    ( { model | page = EmailPage }
                    , Ports.focus ".wizard__address"
                    )

                Welcome.LoginWithAddress ->
                    ( { model | page = AddressPage }
                    , Ports.focus ".wizard__address"
                    )

        EmailMsg subMsg ->
            let
                ( context, cmd ) =
                    Email.update subMsg model.context
            in
            case subMsg of
                Email.LoginWithAddress ->
                    ( { model | context = context, page = AddressPage }
                    , Ports.focus ".wizard__address"
                    )

                Email.GoToWelcome ->
                    ( { model | context = context, page = WelcomePage }
                    , Cmd.none
                    )

                _ ->
                    ( { model | context = context }, Cmd.map EmailMsg cmd )

        AddressMsg subMsg ->
            let
                ( context, cmd ) =
                    Address.update subMsg model.context
            in
            case subMsg of
                Address.LoginWithCustomServer ->
                    ( { model | context = context, page = EmailPage }
                    , Ports.focus ".wizard__address"
                    )

                Address.GoToWelcome ->
                    ( { model | context = context, page = WelcomePage }
                    , Cmd.none
                    )

                _ ->
                    ( { model | context = context }, Cmd.map AddressMsg cmd )

        OAuthMsg subMsg ->
            let
                ( context, cmd ) =
                    OAuth.update subMsg model.context
            in
            ( { model | context = context }, Cmd.map OAuthMsg cmd )

        LoginWithCustomServer oidcLoginUrl ->
            let
                ( context, cmd ) =
                    model.context
                        |> OAuth.setOIDCLoginURL oidcLoginUrl
                        |> OAuth.startLogin
            in
            ( { model | context = context, page = OAuthPage }
            , cmd
            )

        RegistrationDone syncConfig ->
            ( { model
                | page = FolderPage
                , context = Context.setSyncConfig model.context syncConfig
              }
            , Cmd.none
            )

        RegistrationError error ->
            case model.page of
                AddressPage ->
                    let
                        ( context, cmd ) =
                            Address.update (Address.RegistrationError error) model.context
                    in
                    ( { model | context = context }, Cmd.map AddressMsg cmd )

                EmailPage ->
                    let
                        ( context, cmd ) =
                            Email.update (Email.RegistrationError error) model.context
                    in
                    ( { model | context = context }, Cmd.map EmailMsg cmd )

                OAuthPage ->
                    let
                        ( context, cmd ) =
                            OAuth.update (OAuth.OAuthError error) model.context
                    in
                    ( { model | context = context }, Cmd.map OAuthMsg cmd )

                _ ->
                    ( model, Cmd.none )

        FolderMsg subMsg ->
            let
                ( context, cmd ) =
                    Folder.update subMsg model.context
            in
            ( { model | context = context }, cmd )


port registerWithTwake : () -> Cmd msg



-- SUBSCRIPTIONS


subscriptions : Model -> Sub Msg
subscriptions model =
    Sub.batch
        [ Ports.registrationError RegistrationError
        , SyncConfig.gotSyncConfig RegistrationDone
        , Ports.folderError (FolderMsg << Folder.SetError)
        , Ports.folder (FolderMsg << Folder.FillFolder)
        , OAuthConfig.gotOIDCLoginURL LoginWithCustomServer
        , Time.every 10000 (OAuthMsg << OAuth.Tick)
        ]



-- VIEW


view : Helpers -> Model -> Html Msg
view helpers model =
    section
        [ classList
            [ ( "wizard", True )
            , ( "on-step-welcome", model.page == WelcomePage )
            , ( "on-step-email", model.page == EmailPage )
            , ( "on-step-address", model.page == AddressPage )
            , ( "on-step-oauth", model.page == OAuthPage )
            , ( "on-step-folder", model.page == FolderPage )
            ]
        ]
        [ Html.map WelcomeMsg (Welcome.view helpers model.context)
        , Html.map EmailMsg (Email.view helpers model.context)
        , Html.map AddressMsg (Address.view helpers model.context)
        , Html.map OAuthMsg (OAuth.view helpers model.context)
        , Html.map FolderMsg (Folder.view helpers model.context)
        ]

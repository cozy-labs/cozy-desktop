module Window.Onboarding.Folder exposing
    ( Model
    , Msg(..)
    , init
    , isValid
    , update
    , view
    )

import Data.SyncFolderConfig as SyncFolderConfig exposing (SyncFolderConfig)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Icons exposing (..)
import Locale exposing (Helpers)
import Ports



-- MODEL


type alias Model =
    SyncFolderConfig


init : String -> SyncFolderConfig
init =
    SyncFolderConfig.valid


isValid : SyncFolderConfig -> Bool
isValid =
    SyncFolderConfig.isValid



-- UPDATE


type Msg
    = ChooseFolder
    | FillFolder Model
    | SetError String
    | StartSync


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case
        msg
    of
        ChooseFolder ->
            ( model, Ports.chooseFolder () )

        FillFolder folder ->
            ( folder, Cmd.none )

        SetError error ->
            ( { model
                | error =
                    if error == "" then
                        Nothing

                    else
                        Just error
              }
            , Cmd.none
            )

        StartSync ->
            ( model, Ports.startSync model.folder )



-- VIEW


view : Helpers -> Model -> Html Msg
view helpers model =
    div
        [ classList
            [ ( "step", True )
            , ( "step-folder", True )
            , ( "step-error", not (isValid model) )
            ]
        ]
        [ div
            [ class "step-content" ]
            [ if isValid model then
                Icons.bigTick

              else
                Icons.bigCross
            , h1 []
                [ text <|
                    helpers.t <|
                        if isValid model then
                            "Folder All done"

                        else
                            "Folder Please choose another folder"
                ]
            , p [ class "folder-helper" ]
                [ text <|
                    helpers.t "Folder Select a location for your Cozy folder:"
                ]
            , div [ class "coz-form-group" ]
                [ a
                    [ class "folder__selector"
                    , href "#"
                    , onClick ChooseFolder
                    ]
                    [ text model.folder ]
                , p [ class "error-message" ]
                    [ text <| helpers.t <| Maybe.withDefault "" model.error ]

                -- TODO: Link to the relevant FAQ section?
                -- TODO: Include button to reset to default?
                ]
            , a
                [ class "btn"
                , href "#"
                , if isValid model then
                    onClick StartSync

                  else
                    attribute "disabled" "true"
                ]
                [ span [] [ text (helpers.t "Folder Use Cozy Drive") ] ]
            ]
        ]

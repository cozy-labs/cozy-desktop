module Window.Onboarding.Folder exposing
    ( Msg(..)
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
import Window.Onboarding.Context as Context exposing (Context)



-- MODEL


isValid : SyncFolderConfig -> Bool
isValid =
    SyncFolderConfig.isValid



-- UPDATE


type Msg
    = ChooseFolder
    | FillFolder SyncFolderConfig
    | SetError String
    | StartSync


update : Msg -> Context -> ( Context, Cmd msg )
update msg context =
    case msg of
        FillFolder folderConfig ->
            ( Context.setFolderConfig context folderConfig, Cmd.none )

        ChooseFolder ->
            ( context, Ports.chooseFolder () )

        SetError error ->
            ( Context.setFolderConfig context
                (SyncFolderConfig.setError context.folderConfig error)
            , Cmd.none
            )

        StartSync ->
            ( context, Ports.startSync context.folderConfig.folder )



-- VIEW


view : Helpers -> Context -> Html Msg
view helpers context =
    div
        [ classList
            [ ( "step", True )
            , ( "step-folder", True )
            , ( "step-error", not (isValid context.folderConfig) )
            ]
        ]
        [ div
            [ class "step-content" ]
            [ if isValid context.folderConfig then
                Icons.bigTick

              else
                Icons.bigCross
            , h1 []
                [ text <|
                    helpers.t <|
                        if isValid context.folderConfig then
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
                    [ text context.folderConfig.folder ]
                , p [ class "error-message" ]
                    [ text <| helpers.t <| Maybe.withDefault "" context.folderConfig.error ]

                -- TODO: Link to the relevant FAQ section?
                -- TODO: Include button to reset to default?
                ]
            , a
                [ class "btn"
                , href "#"
                , if isValid context.folderConfig then
                    onClick StartSync

                  else
                    attribute "disabled" "true"
                ]
                [ span [] [ text (helpers.t "Folder Use Cozy Drive") ] ]
            ]
        ]

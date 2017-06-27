port module Folder exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Focus exposing (focus)
import Helpers exposing (Helpers)


-- MODEL


type alias Model =
    { folder : String
    , error : String
    }


init : String -> Model
init folder =
    { folder = folder
    , error = ""
    }



-- UPDATE


type Msg
    = ChooseFolder
    | FillFolder String
    | SetError String
    | StartSync


port chooseFolder : () -> Cmd msg


port startSync : String -> Cmd msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case
        msg
    of
        ChooseFolder ->
            ( model, chooseFolder () )

        FillFolder folder ->
            ( { model | folder = folder, error = "" }, Cmd.none )

        SetError error ->
            ( { model | error = error }, Cmd.none )

        StartSync ->
            ( model, startSync model.folder )



-- VIEW


view : Helpers -> Model -> Html Msg
view helpers model =
    div
        [ classList
            [ ( "step", True )
            , ( "step-folder", True )
            , ( "step-error", model.error /= "" )
            ]
        ]
        [ p [ class "upper error-message" ]
            [ text (helpers.t model.error) ]
        , img
            [ src "images/done.svg"
            , class "done"
            ]
            []
        , h1 [] [ text (helpers.t "Folder All done") ]
        , label [] [ text (helpers.t "Folder Select a location for your Cozy folder:") ]
        , a
            [ class "folder__selector"
            , href "#"
            , onClick ChooseFolder
            ]
            [ text model.folder
            , img [ src "images/down.svg" ] []
            ]
        , a
            [ class "btn"
            , href "#"
            , onClick StartSync
            ]
            [ text (helpers.t "Folder Use Cozy Drive") ]
        ]

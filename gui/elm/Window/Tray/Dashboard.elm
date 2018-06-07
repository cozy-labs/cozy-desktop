module Window.Tray.Dashboard exposing (..)

import Data.File as File exposing (File)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Ports
import Time exposing (Time)
import Locale exposing (Helpers)


-- MODEL


type alias Model =
    { now : Time
    , files : List File
    , page : Int
    }


init : Model
init =
    { now = 0
    , files = []
    , page = 1
    }


nbActivitiesPerPage =
    20


maxActivities =
    250



-- UPDATE


type Msg
    = Transfer File
    | Remove File
    | OpenFile File
    | Tick Time
    | ShowMore
    | Reset


samePath : File -> File -> Bool
samePath a b =
    a.path == b.path


update : Msg -> Model -> ( Model, Cmd msg )
update msg model =
    case msg of
        Transfer file ->
            let
                files =
                    file
                        :: (List.filter (samePath file >> not) model.files)
                        |> List.take maxActivities
            in
                ( { model | files = files }, Cmd.none )

        Remove file ->
            let
                files =
                    List.filter (samePath file >> not) model.files
            in
                ( { model | files = files }, Cmd.none )

        OpenFile file ->
            ( model, Ports.openFile file.path )

        Tick now ->
            ( { model | now = now }, Cmd.none )

        ShowMore ->
            ( { model | page = model.page + 1 }, Cmd.none )

        Reset ->
            ( { model | page = 1 }, Cmd.none )



-- VIEW


renderFile : Helpers -> Model -> File -> Html Msg
renderFile helpers model file =
    let
        ( basename, extname ) =
            File.splitName file.filename
    in
        div
            [ class "file-line"
            , title file.path
            , onClick (OpenFile file)
            ]
            [ div [ class ("file-type file-type-" ++ file.icon) ] []
            , span [ class "file-name-wrapper" ]
                [ span [ class "file-name-name" ] [ text basename ]
                , span [ class "file-name-ext" ] [ text extname ]
                ]
            , span [ class "file-extra" ]
                [ span [ class "file-time-ago" ] [ text (helpers.distance_of_time_in_words file.updated model.now) ]
                , text file.path
                ]
            ]


showMoreButton : Helpers -> Html Msg
showMoreButton helpers =
    div [ class "show-more-container" ]
        [ a
            [ class "show-more-btn"
            , href "#"
            , onClick ShowMore
            ]
            [ text (helpers.t "Dashboard Show more files") ]
        ]


view : Helpers -> Model -> Html Msg
view helpers model =
    let
        nbFiles =
            model.page * nbActivitiesPerPage

        renderLine =
            renderFile helpers model

        filesToRender =
            List.take nbFiles model.files
    in
        section [ class "two-panes__content two-panes__content--dashboard" ]
            [ div [ class "recent-files" ]
                ((List.map renderLine filesToRender)
                    ++ if (List.length model.files > nbFiles) then
                        [ showMoreButton helpers ]
                       else
                        []
                )
            ]

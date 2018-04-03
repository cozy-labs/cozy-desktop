port module Dashboard exposing (..)

import Model exposing (RemoteWarning)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Time exposing (Time)
import Helpers exposing (Helpers)


-- MODEL


type alias File =
    { filename : String
    , icon : String
    , path : String
    , size : Int
    , updated : Time
    }


type alias Model =
    { now : Time
    , files : List File
    , page : Int
    , remoteWarnings : List RemoteWarning
    }


init : Model
init =
    { now = 0
    , files = []
    , page = 1
    , remoteWarnings = []
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
    | RemoteWarnings (List RemoteWarning)


samePath : File -> File -> Bool
samePath a b =
    a.path == b.path


port openFile : String -> Cmd msg


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
            ( model, openFile file.path )

        Tick now ->
            ( { model | now = now }, Cmd.none )

        ShowMore ->
            ( { model | page = model.page + 1 }, Cmd.none )

        Reset ->
            ( { model | page = 1 }, Cmd.none )

        RemoteWarnings warnings ->
            ( { model | remoteWarnings = warnings }, Cmd.none )



-- VIEW


renderFile : Helpers -> Model -> File -> Html Msg
renderFile helpers model file =
    let
        ( basename, extname ) =
            Helpers.splitFileName file.filename
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
            , case model.remoteWarnings of
                { title, details, links } :: _ ->
                    div []
                        [ h5 [] [ text title ]
                        , p [] [ text details ]
                        , p []
                            [ button [] [ text links.action ]
                            ]
                        ]

                _ ->
                    text ""
            ]

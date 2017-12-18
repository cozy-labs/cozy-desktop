module Dashboard exposing (..)

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
    | Tick Time
    | ShowMore
    | Reset


samePath : File -> File -> Bool
samePath a b =
    a.path == b.path


update : Msg -> Model -> Model
update msg model =
    case msg of
        Transfer file ->
            let
                files =
                    file
                        :: (List.filter (samePath file >> not) model.files)
                        |> List.take maxActivities
            in
                { model | files = files }

        Remove file ->
            let
                files =
                    List.filter (samePath file >> not) model.files
            in
                { model | files = files }

        Tick now ->
            { model | now = now }

        ShowMore ->
            { model | page = model.page + 1 }

        Reset ->
            { model | page = 1 }



-- VIEW


view : Helpers -> Model -> Html Msg
view helpers model =
    let
        fileToListItem file =
            let
                file_size =
                    helpers.number_to_human_size file.size

                time_ago =
                    helpers.distance_of_time_in_words file.updated model.now
            in
                li [ title file.path ]
                    [ i [ class ("file-type file-type-" ++ file.icon) ] []
                    , h3 [ class "file-name" ] [ text file.filename ]
                    , span [ class "file-size" ] [ text file_size ]
                    , span [ class "file-time-ago" ] [ text time_ago ]
                    ]

        nbFiles =
            model.page * nbActivitiesPerPage

        recentList =
            List.map fileToListItem (List.take nbFiles model.files)

        showMoreButton =
            li []
                [ a
                    [ class "btn"
                    , href "#"
                    , onClick ShowMore
                    ]
                    [ text (helpers.t "Dashboard Show more files") ]
                ]

        recentListWithMore =
            if List.length model.files > nbFiles then
                recentList ++ [ showMoreButton ]
            else
                recentList
    in
        section [ class "two-panes__content two-panes__content--dashboard" ]
            [ ul [ class "recent-files" ] recentListWithMore
            ]

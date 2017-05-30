module Dashboard exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Time exposing (Time)
import Helpers exposing (Helpers)


-- MODEL


type Status
    = UpToDate
    | Offline
    | Sync String
    | Error String


type alias File =
    { filename : String
    , icon : String
    , path : String
    , size : Int
    , updated : Time
    }


type alias Model =
    { status : Status
    , now : Time
    , files : List File
    , page : Int
    }


init : Model
init =
    { status = Sync "…"
    , now = 0
    , files = []
    , page = 1
    }


nbActivitiesPerPage =
    20


maxActivities =
    250



-- UPDATE


type Msg
    = Updated
    | Syncing
    | GoOffline
    | Transfer File
    | Remove File
    | SetError String
    | Tick Time
    | ShowMore


samePath : File -> File -> Bool
samePath a b =
    a.path == b.path


update : Msg -> Model -> Model
update msg model =
    case msg of
        Updated ->
            { model | status = UpToDate }

        Syncing ->
            { model | status = Sync "…" }

        GoOffline ->
            { model | status = Offline }

        Transfer file ->
            let
                files =
                    file
                        :: (List.filter (samePath file >> not) model.files)
                        |> List.take maxActivities

                status =
                    Sync file.filename
            in
                { model | status = status, files = files }

        Remove file ->
            let
                files =
                    List.filter (samePath file >> not) model.files
            in
                { model | files = files }

        SetError error ->
            { model | status = Error error }

        Tick now ->
            { model | now = now }

        ShowMore ->
            { model | page = model.page + 1 }



-- VIEW


view : Helpers -> Model -> Html Msg
view helpers model =
    let
        statusMessage =
            case
                model.status
            of
                UpToDate ->
                    p [ class "status" ]
                        [ img
                            [ src "images/done.svg"
                            , class "status__icon status__icon--uptodate"
                            ]
                            []
                        , text (helpers.t "Dashboard Your cozy is up to date!")
                        ]

                Offline ->
                    p [ class "status" ]
                        [ img
                            [ src "images/pause.svg"
                            , class "status__icon status__icon--offline"
                            ]
                            []
                        , text (helpers.t "Dashboard Offline")
                        ]

                Sync filename ->
                    p [ class "status" ]
                        [ img
                            [ src "images/sync.svg"
                            , class "status__icon status__icon--sync"
                            ]
                            []
                        , span []
                            [ text (helpers.t "Dashboard Syncing")
                            , text " "
                            , em [] [ text filename ]
                            ]
                        ]

                Error message ->
                    p [ class "status" ]
                        [ img
                            [ src "images/error.svg"
                            , class "status__icon status__icon--error"
                            ]
                            []
                        , span []
                            [ text (helpers.t "Dashboard Error:")
                            , text " "
                            , em [] [ text message ]
                            ]
                        ]

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
            [ h1 [] [ text (helpers.t "Dashboard Dashboard") ]
            , statusMessage
            , h2 [] [ text (helpers.t "Dashboard Recent activities") ]
            , ul [ class "recent-files" ] recentListWithMore
            ]

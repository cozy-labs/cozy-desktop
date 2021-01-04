module Window.Tray.Dashboard exposing
    ( Model
    , Msg(..)
    , init
    , maxActivities
    , nbActivitiesPerPage
    , renderFile
    , samePath
    , showMoreButton
    , update
    , view
    )

import Data.File as File exposing (EncodedFile, File)
import Data.UserAction as UserAction exposing (UserAction)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Locale exposing (Helpers)
import Ports
import Time



-- MODEL


type alias Model =
    { now : Time.Posix
    , files : List File
    , page : Int
    , userActions : List UserAction
    }


init : Model
init =
    { now = Time.millisToPosix 0
    , files = []
    , page = 1
    , userActions = []
    }


nbActivitiesPerPage =
    20


maxActivities =
    250



-- UPDATE


type Msg
    = Transfer EncodedFile
    | Remove EncodedFile
    | OpenFile File
    | Tick Time.Posix
    | ShowMore
    | Reset
    | GotUserActions (List UserAction)
    | UserActionSkipped
    | UserActionInProgress


update : Msg -> Model -> ( Model, Cmd msg )
update msg model =
    case msg of
        Transfer encodedFile ->
            let
                file =
                    File.decode encodedFile

                files =
                    file
                        :: List.filter (samePath file >> not) model.files
                        |> List.take maxActivities
            in
            ( { model | files = files }, Cmd.none )

        Remove encodedFile ->
            let
                file =
                    File.decode encodedFile

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

        GotUserActions actions ->
            ( { model | userActions = actions }, Cmd.none )

        UserActionSkipped ->
            let
                cmd =
                    case currentUserAction model of
                        Just action ->
                            Ports.userActionSkipped (UserAction.encode action)

                        Nothing ->
                            Cmd.none
            in
            ( model |> removeCurrentAction, cmd )

        UserActionInProgress ->
            let
                cmd =
                    case currentUserAction model of
                        Just action ->
                            Ports.userActionInProgress (UserAction.encode action)

                        Nothing ->
                            Cmd.none
            in
            ( model, cmd )



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
        , span [ class "file-line-content file-name-wrapper" ]
            [ span [ class "file-name-name" ] [ text basename ]
            , span [ class "file-name-ext" ] [ text extname ]
            ]
        , span [ class "file-line-content file-extra" ]
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


viewActions : Helpers -> List UserAction -> Html Msg
viewActions helpers userActions =
    case userActions of
        action :: _ ->
            viewAction helpers action

        _ ->
            Html.text ""


viewAction : Helpers -> UserAction -> Html Msg
viewAction helpers action =
    let
        title =
            UserAction.title action
                |> helpers.t
                |> text

        content =
            UserAction.details action
                |> List.map (Tuple.mapFirst helpers.t)
                |> List.map (Tuple.mapSecond (List.map helpers.t))
                |> List.map
                    (\( string, chains ) ->
                        Locale.interpolate chains string
                    )
                |> List.map helpers.capitalize
                |> List.map text
                |> List.intersperse (br [] [])

        link =
            UserAction.getLink action

        primaryLabel =
            UserAction.primaryLabel action
                |> helpers.t
                |> text

        secondaryLabel =
            UserAction.secondaryLabel action
                |> Maybe.map helpers.t
                |> Maybe.map text

        buttons =
            case secondaryLabel of
                Just label ->
                    [ button
                        [ class "c-btn c-btn--danger-outline"
                        , onClick UserActionSkipped
                        ]
                        [ span [] [ label ] ]
                    , button
                        [ class "c-btn"
                        , onClick UserActionInProgress
                        ]
                        [ span [] [ primaryLabel ] ]
                    ]

                Nothing ->
                    [ button
                        [ class "c-btn c-btn--ghost"
                        , onClick UserActionSkipped
                        ]
                        [ span [] [ text (helpers.t "UserAction OK") ] ]
                    , a
                        [ class "c-btn" --u-flex-auto"
                        , href (Maybe.withDefault "" link)
                        , onClick UserActionInProgress
                        ]
                        [ span [] [ primaryLabel ] ]
                    ]
    in
    div [ class "u-p-1 u-bg-paleGrey" ]
        [ header [ class "u-title-h1" ] [ title ]
        , p [ class "u-text" ] content
        , div [ class "u-flex u-flex-justify-between" ] buttons
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
        [ viewActions helpers model.userActions
        , div [ class "recent-files" ]
            (List.map renderLine filesToRender
                ++ (if List.length model.files > nbFiles then
                        [ showMoreButton helpers ]

                    else
                        []
                   )
            )
        ]



--HELPERS


samePath : File -> File -> Bool
samePath a b =
    a.path == b.path


removeCurrentAction : Model -> Model
removeCurrentAction model =
    { model
        | userActions =
            List.tail model.userActions
                |> Maybe.withDefault []
    }


currentUserAction : Model -> Maybe UserAction
currentUserAction model =
    List.head model.userActions

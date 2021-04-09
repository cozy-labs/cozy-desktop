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
import Data.Platform as Platform exposing (Platform)
import Data.UserAction as UserAction exposing (UserAction)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Json.Decode as Json
import Locale exposing (Helpers)
import Ports
import Regex
import Time
import Util.List as List



-- MODEL


type alias Model =
    { now : Time.Posix
    , files : List File
    , page : Int
    , platform : Platform
    , userActions : List UserAction
    }


init : Platform -> Model
init platform =
    { now = Time.millisToPosix 0
    , files = []
    , page = 1
    , platform = platform
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
    | OpenPath String
    | ShowInParent String
    | Tick Time.Posix
    | ShowMore
    | Reset
    | GotUserActions (List UserAction)
    | UserActionSkipped
    | UserActionInProgress
    | UserActionDone


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

        OpenPath path ->
            ( model, Ports.openFile path )

        ShowInParent path ->
            ( model, Ports.showInParent path )

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

        UserActionDone ->
            let
                cmd =
                    case currentUserAction model of
                        Just action ->
                            Ports.userActionDone (UserAction.encode action)

                        Nothing ->
                            Cmd.none
            in
            ( model |> removeCurrentAction, cmd )



-- VIEW


renderFile : Helpers -> Model -> File -> Html Msg
renderFile helpers model file =
    let
        pathSeparator =
            Platform.pathSeparator model.platform

        ( basename, extname ) =
            File.splitName file.filename

        timeAgo =
            helpers.distance_of_time_in_words file.updated model.now

        dirPath =
            File.dirPath pathSeparator file.path file.filename

        filenameTitle =
            Locale.interpolate [ file.filename ] <|
                helpers.t "Dashboard Open file {0}"

        dirPathTitle =
            if dirPath == pathSeparator then
                helpers.t "Dashboard Show in parent folder"

            else
                Locale.interpolate [ dirPath ] <|
                    helpers.t "Dashboard Show in folder {0}"
    in
    div
        [ class "file-line"
        , title filenameTitle
        , onClick (OpenPath file.path)
        ]
        [ div [ class ("file-type file-type-" ++ file.icon) ] []
        , span [ class "file-line-content file-name-wrapper" ]
            [ span [ class "file-name-name" ] [ text basename ]
            , span [ class "file-name-ext" ] [ text extname ]
            ]
        , span [ class "file-line-content file-extra" ]
            [ span [ class "file-time-ago" ] [ text timeAgo ]
            , span
                [ class "file-parent-folder"
                , title dirPathTitle
                , stopPropagationOn "click" <|
                    Json.map (\msg -> ( msg, True )) <|
                        Json.succeed (ShowInParent file.path)
                ]
                [ text dirPath ]
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
                |> List.map viewActionContentLine
                |> List.intersperse [ br [] [] ]
                |> List.concat

        link =
            UserAction.getLink action

        primaryButton =
            case UserAction.primaryInteraction action of
                UserAction.Retry label ->
                    actionButton helpers UserActionDone [] label Nothing

                UserAction.Open label ->
                    actionButton helpers UserActionInProgress [] label link

                _ ->
                    actionButton helpers UserActionDone [] "UserAction OK" Nothing

        secondaryButton =
            case UserAction.secondaryInteraction action of
                Just UserAction.GiveUp ->
                    actionButton helpers UserActionSkipped [ "c-btn--danger-outline" ] "UserAction Give up" Nothing

                Just UserAction.Ok ->
                    actionButton helpers UserActionSkipped [ "c-btn--ghost" ] "UserAction OK" Nothing

                _ ->
                    []
    in
    div [ class "u-p-1 u-bg-paleGrey" ]
        [ header [ class "u-title-h1" ] [ title ]
        , p [ class "u-text" ] content
        , div
            [ class "u-flex u-flex-justify-end" ]
            (List.append secondaryButton primaryButton)
        ]


actionButton : Helpers -> Msg -> List String -> String -> Maybe String -> List (Html Msg)
actionButton helpers msg classList label link =
    let
        classes =
            String.join " " ([ "c-btn" ] ++ classList)
    in
    case link of
        Just str ->
            [ a
                [ class classes
                , href str
                , onClick msg
                ]
                [ span [] [ text (helpers.t label) ] ]
            ]

        Nothing ->
            [ button
                [ class classes
                , onClick msg
                ]
                [ span [] [ text (helpers.t label) ] ]
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


viewActionContentLine : String -> List (Html Msg)
viewActionContentLine line =
    let
        decorated =
            Regex.find decorationRegex line
                |> List.map decoratedName

        rest =
            Regex.split decorationRegex line
                |> List.map text
    in
    List.intersperseList decorated rest


decorationRegex : Regex.Regex
decorationRegex =
    -- Find all groups of characters between backticks
    Maybe.withDefault Regex.never <|
        Regex.fromString "`(.+?)`"


decoratedName : Regex.Match -> Html Msg
decoratedName match =
    let
        path =
            List.head match.submatches
    in
    case path of
        Just (Just str) ->
            viewName str

        _ ->
            text ""


viewName : String -> Html Msg
viewName path =
    span
        [ class "u-bg-frenchPass u-bdrs-4 u-ph-half u-pv-0 u-c-pointer"
        , title path
        , onClick (ShowInParent path)
        ]
        [ text (shortName path) ]


shortName : String -> String
shortName long =
    String.split "/" long
        |> List.filter (not << String.isEmpty)
        |> List.reverse
        |> List.head
        |> Maybe.withDefault ""

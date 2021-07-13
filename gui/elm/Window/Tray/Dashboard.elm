module Window.Tray.Dashboard exposing
    ( Model
    , Msg(..)
    , init
    , maxActivities
    , nbActivitiesPerPage
    , renderFile
    , showMoreButton
    , update
    , view
    )

import Data.File as File exposing (EncodedFile, File)
import Data.Path as Path exposing (Path)
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
    | OpenPath Path
    | ShowInParent Path
    | Tick Time.Posix
    | ShowMore
    | Reset
    | GotUserActions (List UserAction)
    | UserActionSkipped UserAction
    | UserActionInProgress UserAction
    | UserActionDone UserAction
    | UserActionDetails UserAction


update : Msg -> Model -> ( Model, Cmd msg )
update msg model =
    case msg of
        Transfer encodedFile ->
            let
                file =
                    File.decode model.platform encodedFile

                files =
                    file
                        :: List.filter (File.samePath file >> not) model.files
                        |> List.take maxActivities
            in
            ( { model | files = files }, Cmd.none )

        Remove encodedFile ->
            let
                file =
                    File.decode model.platform encodedFile

                files =
                    List.filter (File.samePath file >> not) model.files
            in
            ( { model | files = files }, Cmd.none )

        OpenPath path ->
            ( model, Ports.openFile (Path.toString path) )

        ShowInParent path ->
            ( model, Ports.showInParent (Path.toString path) )

        Tick now ->
            ( { model | now = now }, Cmd.none )

        ShowMore ->
            ( { model | page = model.page + 1 }, Cmd.none )

        Reset ->
            ( { model | page = 1 }, Cmd.none )

        GotUserActions actions ->
            ( { model | userActions = actions }, Cmd.none )

        UserActionSkipped action ->
            ( model |> removeCurrentAction, UserAction.skip action )

        UserActionInProgress action ->
            ( model, UserAction.start action )

        UserActionDone action ->
            ( model |> removeCurrentAction, UserAction.end action )

        UserActionDetails action ->
            ( model, UserAction.showDetails action )



-- VIEW


renderFile : Helpers -> Model -> File -> Html Msg
renderFile helpers model file =
    let
        ( basename, extname ) =
            File.splitName file.filename

        timeAgo =
            helpers.distance_of_time_in_words file.updated model.now

        dirPath =
            Path.parent file.path

        filenameTitle =
            Locale.interpolate [ file.filename ] <|
                helpers.t "Dashboard Open file {0}"

        dirPathTitle =
            if Path.isRoot dirPath then
                helpers.t "Dashboard Show in parent folder"

            else
                Locale.interpolate [ Path.toString dirPath ] <|
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
                [ text (Path.toString dirPath) ]
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


viewActions : Helpers -> Model -> Html Msg
viewActions helpers model =
    case model.userActions of
        action :: _ ->
            viewAction helpers model action

        _ ->
            Html.text ""


viewAction : Helpers -> Model -> UserAction -> Html Msg
viewAction helpers model action =
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
                |> List.map (viewActionContentLine model)
                |> List.intersperse [ br [] [] ]
                |> List.concat

        link =
            UserAction.getLink action

        primaryButton =
            case UserAction.primaryInteraction action of
                UserAction.GiveUp ->
                    actionButton helpers (UserActionSkipped action) [] "UserAction Give up" Nothing

                UserAction.Retry label ->
                    actionButton helpers (UserActionDone action) [] label Nothing

                UserAction.Open label ->
                    actionButton helpers (UserActionInProgress action) [] label link

                _ ->
                    actionButton helpers (UserActionDone action) [] "UserAction OK" Nothing

        secondaryButton =
            case UserAction.secondaryInteraction action of
                UserAction.GiveUp ->
                    actionButton helpers (UserActionSkipped action) [ "c-btn--danger-outline" ] "UserAction Give up" Nothing

                UserAction.Ok ->
                    actionButton helpers (UserActionSkipped action) [ "c-btn--ghost" ] "UserAction OK" Nothing

                UserAction.ShowDetails ->
                    actionButton helpers (UserActionDetails action) [ "c-btn--ghost" ] "UserAction Read more" Nothing

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
        [ viewActions helpers model
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


viewActionContentLine : Model -> String -> List (Html Msg)
viewActionContentLine { platform } line =
    let
        decorated =
            decoratedStrings line
                |> List.map (Maybe.map (Path.fromString platform))
                |> List.map decoratedName

        rest =
            Regex.split decorationRegex line
                |> List.map text
    in
    List.intersperseList decorated rest


decoratedStrings : String -> List (Maybe String)
decoratedStrings line =
    Regex.find decorationRegex line
        |> List.map .submatches
        |> List.map List.head
        |> List.map (Maybe.withDefault Nothing)


decorationRegex : Regex.Regex
decorationRegex =
    -- Find all groups of characters between backticks
    Maybe.withDefault Regex.never <|
        Regex.fromString "`(.+?)`"


decoratedName : Maybe Path -> Html Msg
decoratedName path =
    case path of
        Just p ->
            span
                [ class "u-bg-frenchPass u-bdrs-4 u-ph-half u-pv-0 u-c-pointer"
                , title (Path.toString p)
                , onClick (ShowInParent p)
                ]
                [ text (Path.name p) ]

        _ ->
            text ""

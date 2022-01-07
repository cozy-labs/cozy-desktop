port module Data.UserAction exposing
    ( Command(..)
    , EncodedUserAction
    , Msg(..)
    , UserAction(..)
    , decode
    , same
    , sendCommand
    , showDetails
    , start
    , view
    )

import Data.Path as Path exposing (Path)
import Data.Platform as Platform exposing (Platform)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Locale exposing (Helpers)
import Util.Conditional exposing (ShowInWeb, inWeb, onOS)
import Util.DecorationParser exposing (DecorationResult(..), findDecorations)


type UserAction
    = ClientAction String ClientActionInfo
    | RemoteAction String RemoteActionInfo


type UserActionStatus
    = Required
    | InProgress
    | Done


type Side
    = Local
    | Remote


type alias ClientActionInfo =
    { status : UserActionStatus, seq : Int, docType : String, path : String, side : Maybe Side }


type alias RemoteActionInfo =
    { status : UserActionStatus, link : String }


type Command
    = CreateConflict
    | GiveUp
    | LinkDirectories
    | Retry
    | ShowDetails


type Msg
    = SendCommand Command UserAction -- send specified command to client
    | ShowInParent Path ShowInWeb -- open file explorer or Cozy Drive Web at parent's path


same : UserAction -> UserAction -> Bool
same actionA actionB =
    case ( actionA, actionB ) of
        ( ClientAction codeA a, ClientAction codeB b ) ->
            a.seq == b.seq && codeA == codeB

        ( RemoteAction codeA _, RemoteAction codeB _ ) ->
            codeA == codeB

        _ ->
            False



--Read or write to and from Ports


port userActionDetails : EncodedUserAction -> Cmd msg


port userActionInProgress : EncodedUserAction -> Cmd msg


port userActionCommand : ( EncodedCommand, EncodedUserAction ) -> Cmd msg


showDetails : UserAction -> Cmd msg
showDetails action =
    userActionDetails (encodeAction action)


start : UserAction -> Cmd msg
start action =
    userActionInProgress (encodeAction action)


sendCommand : Command -> UserAction -> Cmd msg
sendCommand cmd action =
    case cmd of
        ShowDetails ->
            showDetails action

        _ ->
            userActionCommand ( encodeCommand cmd, encodeAction action )


type alias EncodedUserAction =
    { seq : Maybe Int
    , status : String
    , code : String
    , side : Maybe String
    , doc :
        Maybe
            { docType : String
            , path : String
            }
    , links :
        Maybe
            { self : String
            }
    }


type alias EncodedCommand =
    String


decode : EncodedUserAction -> Maybe UserAction
decode { seq, status, code, side, doc, links } =
    let
        decodedStatus =
            decodeUserActionStatus status
    in
    case ( doc, links, seq ) of
        ( _, Just { self }, _ ) ->
            Just (RemoteAction code { status = decodedStatus, link = self })

        ( Just { docType, path }, _, Just num ) ->
            Just
                (ClientAction code
                    { status = decodedStatus
                    , seq = num
                    , docType = docType
                    , path = path
                    , side = decodedSide side
                    }
                )

        _ ->
            Nothing


encodeAction : UserAction -> EncodedUserAction
encodeAction action =
    case action of
        ClientAction code a ->
            { seq = Just a.seq
            , status = encodeUserActionStatus a.status
            , code = code
            , side = encodedSide a.side
            , doc = Just { docType = a.docType, path = a.path }
            , links = Nothing
            }

        RemoteAction code a ->
            { seq = Nothing
            , status = encodeUserActionStatus a.status
            , code = code
            , side = Nothing
            , links = Just { self = a.link }
            , doc = Nothing
            }


encodeCommand : Command -> EncodedCommand
encodeCommand cmd =
    case cmd of
        CreateConflict ->
            "create-conflict"

        GiveUp ->
            "skip"

        LinkDirectories ->
            "link-directories"

        Retry ->
            "retry"

        ShowDetails ->
            "show-details"


decodeUserActionStatus : String -> UserActionStatus
decodeUserActionStatus status =
    case status of
        "Required" ->
            Required

        "InProgress" ->
            InProgress

        _ ->
            Required


encodeUserActionStatus : UserActionStatus -> String
encodeUserActionStatus status =
    case status of
        Required ->
            "Required"

        InProgress ->
            "InProgress"

        Done ->
            "Done"


decodedSide : Maybe String -> Maybe Side
decodedSide side =
    case side of
        Just "local" ->
            Just Local

        Just "remote" ->
            Just Remote

        _ ->
            Nothing


encodedSide : Maybe Side -> Maybe String
encodedSide side =
    case side of
        Just Local ->
            Just "local"

        Just Remote ->
            Just "remote"

        _ ->
            Nothing



-- View User Action from other modules


type alias UserActionView =
    { title : String, content : List String, buttons : List (Html Msg) }


type ButtonType
    = Primary
    | Secondary
    | PrimaryWithDanger
    | SecondaryWithDanger


view : Helpers -> Platform -> UserAction -> Html Msg
view helpers platform action =
    let
        { title, content, buttons } =
            viewByCode helpers action

        side =
            case action of
                ClientAction _ a ->
                    a.side

                _ ->
                    Nothing
    in
    div [ class "u-p-1 u-bg-paleGrey" ]
        [ header [ class "u-title-h1" ] [ text (helpers.t title) ]
        , p [ class "u-text" ] (actionContent helpers platform content side)
        , div [ class "u-flex u-flex-justify-end" ] buttons
        ]


viewByCode : Helpers -> UserAction -> UserActionView
viewByCode helpers action =
    case action of
        ClientAction "ConflictingName" { docType, path } ->
            let
                localDocType =
                    "Helpers " ++ docType

                localAction =
                    helpers.interpolate [ localDocType ] "UserAction Rename {0}"
            in
            { title = "Error Conflict with existing document"
            , content =
                [ helpers.interpolate [ localDocType, path ] "Error The name of {0} `{1}` is conflicting with an existing document."
                , helpers.interpolate [ localDocType ] "Error You need to rename this {0} to solve the conflict."
                ]
            , buttons =
                [ actionButton helpers (SendCommand Retry action) "UserAction Retry" Secondary
                , actionButton helpers (SendCommand CreateConflict action) localAction Primary
                ]
            }

        ClientAction "ExcludedDir" { path } ->
            let
                localAction =
                    helpers.interpolate [ "Helpers folder" ] "UserAction Rename {0}"
            in
            { title = "Error Conflict with excluded directory"
            , content =
                [ helpers.interpolate [ path ] "Error The remote directory `{0}` was excluded from the synchronization on this device."
                , "Error The local directory with the same path can either be linked to the remote one which will be synchronized again or be renamed to solve this conflict."
                ]
            , buttons =
                [ actionButton helpers (SendCommand CreateConflict action) localAction Secondary
                , actionButton helpers (SendCommand LinkDirectories action) "UserAction Link directories" Primary
                ]
            }

        ClientAction "FileTooLarge" { path } ->
            { title = "Error The file is too large"
            , content =
                [ helpers.interpolate [ path ] "Error The file `{0}` could not be written to your Cozy's disk because it is larger than the maximum file size allowed by your Cozy: 5 GiB."
                , "Error You need to remove it from your local synchronization folder or reduce its size."
                ]
            , buttons =
                [ actionButton helpers (SendCommand GiveUp action) "UserAction Give up" Primary ]
            }

        ClientAction "IncompatibleDoc" { docType, path } ->
            let
                localDocType =
                    "Helpers " ++ docType
            in
            { title = "Error Document path incompatible with current OS"
            , content =
                [ helpers.interpolate [ localDocType, path ] "Error The {0} `{1}`'s name either contains forbidden characters or is reserved or is too long for your Operating System."
                , "Error Try renaming it on your Cozy without using special characters and choose a shorter name if necessary."
                ]
            , buttons =
                [ actionButton helpers (SendCommand ShowDetails action) "UserAction Show details" Secondary
                , actionButton helpers (SendCommand Retry action) "UserAction Retry" Primary
                ]
            }

        ClientAction "InvalidMetadata" { docType, path } ->
            let
                localDocType =
                    "Helpers " ++ docType
            in
            { title = "Error Invalid document metadata"
            , content =
                [ helpers.interpolate [ localDocType, path ] "Error The {0} `{1}`'s metadata cannot be accepted by your Cozy."
                , "Error This message persists if the local metadata of your document is corrupted. In this case try to move it out of the Cozy Drive folder and back again or contact support for help on the procedure."
                ]
            , buttons =
                [ actionButton helpers (SendCommand Retry action) "UserAction Retry" Primary
                ]
            }

        ClientAction "InvalidName" { docType, path } ->
            let
                localDocType =
                    "Helpers " ++ docType
            in
            { title = "Error Invalid document name"
            , content =
                [ helpers.interpolate [ localDocType, path ] "Error The {0} `{1}`'s name contains characters forbidden by your Cozy."
                , "Error Try renaming it without using the following characters: / \\u{0000} \\n \\u{000D}."
                ]
            , buttons = [ actionButton helpers (SendCommand Retry action) "UserAction Retry" Primary ]
            }

        ClientAction "MissingPermissions" { docType, path } ->
            let
                localDocType =
                    "Helpers " ++ docType
            in
            { title = "Error Access denied temporarily"
            , content =
                [ helpers.interpolate [ localDocType, path ] "Error The {0} `{1}` could not be updated on your computer to apply the changes made on your Cozy."
                , "Error Synchronization will resume as soon as you close the opened file(s) blocking this operation or restore sufficient access rights."
                ]
            , buttons = [ actionButton helpers (SendCommand Retry action) "UserAction Retry" Primary ]
            }

        ClientAction "NeedsRemoteMerge" { docType, path } ->
            let
                localDocType =
                    "Helpers " ++ docType
            in
            { title = "Error Conflict with remote version"
            , content =
                [ helpers.interpolate [ localDocType, path ] "Error The {0} `{1}` has been simultaneously modified on your computer and your Cozy."
                , "Error This message persists if Cozy is unable to resolve this conflict. In this case rename the version you want to keep and click on \"Give up\"."
                ]
            , buttons =
                [ actionButton helpers (SendCommand GiveUp action) "UserAction Give up" SecondaryWithDanger
                , actionButton helpers (SendCommand Retry action) "UserAction Retry" Primary
                ]
            }

        ClientAction "NoCozySpace" { docType, path } ->
            let
                localDocType =
                    "Helpers " ++ docType
            in
            { title = "Error Your Cozy's disk space is saturated"
            , content =
                [ helpers.interpolate [ localDocType, path ] "Error The {0} `{1}` could not be written to your Cozy's disk because its maximum storage capacity has been reached."
                , "Error Synchronization will resume as soon as you have freed up space (emptied your Trash, deleted unnecessary files...), or increased its capacity."
                ]
            , buttons = [ actionButton helpers (SendCommand Retry action) "UserAction Retry" Primary ] -- Could show link to buy more disk space
            }

        ClientAction "NoDiskSpace" { docType, path } ->
            let
                localDocType =
                    "Helpers " ++ docType
            in
            { title = "Error Your computer's disk space is insufficient"
            , content =
                [ helpers.interpolate [ localDocType, path ] "Error The {0} `{1}` could not be written to your computer disk because there is not enough space available."
                , "Error Synchronization will resume as soon as you have freed up space (emptied your Trash, deleted unnecessary files…)."
                ]
            , buttons = [ actionButton helpers (SendCommand Retry action) "UserAction Retry" Primary ]
            }

        ClientAction "PathTooDeep" { docType, path } ->
            let
                localDocType =
                    "Helpers " ++ docType
            in
            { title = "Error Document path with too many levels"
            , content =
                [ helpers.interpolate [ localDocType, path ] "Error The {0} `{1}`'s path has too many levels (i.e. parent folders) for your Cozy."
                , "Error Try removing some parent levels or moving it to antoher folder."
                ]
            , buttons = [ actionButton helpers (SendCommand Retry action) "UserAction Retry" Primary ]
            }

        ClientAction "UnknownRemoteError" { docType, path } ->
            let
                localDocType =
                    "Helpers " ++ docType
            in
            { title = "Error Unhandled synchronization error"
            , content =
                [ helpers.interpolate [ localDocType, path ] "Error We encountered an unhandled error while trying to synchronise the {0} `{1}`."
                , "Error Please contact our support to get help."
                ]
            , buttons = [ actionButton helpers (SendCommand Retry action) "UserAction Retry" Primary ] -- Could show help button
            }

        RemoteAction "UserActionRequired" { link } ->
            { title = "CGUUpdated The ToS have been updated"
            , content =
                [ "CGUUpdated Your Cozy hosting provider informs you that it has updated its Terms of Service (ToS)."
                , "CGUUpdated Their acceptance is required to continue using your Cozy."
                ]
            , buttons =
                [ actionButton helpers (SendCommand Retry action) "UserAction OK" Secondary
                , linkButton helpers link "CGUUpdated Read the new ToS" Primary
                ]
            }

        ClientAction _ _ ->
            { title = "", content = [], buttons = [] }

        RemoteAction _ _ ->
            { title = "", content = [], buttons = [] }


actionContent : Helpers -> Platform -> List String -> Maybe Side -> List (Html Msg)
actionContent helpers platform details side =
    details
        |> List.map helpers.capitalize
        |> List.map (viewActionContentLine platform side)
        |> List.intersperse [ br [] [] ]
        |> List.concat


classList : List String -> List ( Maybe Bool, String ) -> String
classList baseList optionalClasses =
    let
        appendActive =
            \( isActive, class ) classes ->
                if Maybe.withDefault False isActive then
                    classes ++ [ class ]

                else
                    classes
    in
    List.foldr appendActive baseList optionalClasses
        |> String.join " "


buttonClass : ButtonType -> String
buttonClass bType =
    [ "c-btn" ]
        ++ (case bType of
                Primary ->
                    []

                Secondary ->
                    [ "c-btn--ghost" ]

                PrimaryWithDanger ->
                    [ "c-btn--danger-outline" ]

                SecondaryWithDanger ->
                    [ "c-btn--danger-outline" ]
           )
        |> String.join " "


actionButton : Helpers -> Msg -> String -> ButtonType -> Html Msg
actionButton helpers msg label bType =
    button
        [ class (buttonClass bType)
        , onClick msg
        ]
        [ span [] [ text (helpers.t label) ] ]


linkButton : Helpers -> String -> String -> ButtonType -> Html Msg
linkButton helpers link label bType =
    a
        [ class (buttonClass bType)
        , href link
        ]
        [ span [] [ text (helpers.t label) ] ]


viewActionContentLine : Platform -> Maybe Side -> String -> List (Html Msg)
viewActionContentLine platform side line =
    let
        toHTML =
            \decoration ->
                case decoration of
                    Decorated path ->
                        Path.fromString platform path
                            |> decoratedName side

                    Normal str ->
                        text str
    in
    findDecorations line
        |> List.map toHTML


decoratedName : Maybe Side -> Path -> Html Msg
decoratedName side path =
    let
        medium =
            case side of
                -- Open on the side opposite of the one on which the change is
                -- being applied.
                Just Local ->
                    inWeb

                _ ->
                    onOS
    in
    span
        [ class "u-bg-frenchPass u-bdrs-4 u-ph-half u-pv-0 u-c-pointer"
        , title (Path.toString path)
        , onClick (ShowInParent path medium)
        ]
        [ text (Path.name path) ]

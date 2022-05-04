port module Data.UserAlert exposing
    ( Command(..)
    , EncodedUserAlert
    , Msg(..)
    , UserAlert(..)
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
import I18n exposing (Helpers)
import Util.Conditional exposing (ShowInWeb, inWeb, onOS)
import Util.DecorationParser exposing (DecorationResult(..), findDecorations)


type alias UserAlertCode =
    String


type UserAlert
    = RemoteError UserAlertCode
    | RemoteWarning UserAlertCode RemoteWarningInfo
    | SynchronizationError UserAlertCode SynchronizationErrorInfo


type UserActionStatus
    = Required
    | InProgress
    | Done


type Side
    = Local
    | Remote


type alias SynchronizationErrorInfo =
    { status : UserActionStatus, seq : Int, docType : String, path : String, side : Maybe Side }


type alias RemoteWarningInfo =
    { status : UserActionStatus, link : String }


type Command
    = CreateConflict
    | GiveUp
    | LinkDirectories
    | Retry
    | ShowDetails


type Msg
    = SendCommand Command UserAlert -- send specified command to client
    | ShowInParent Path ShowInWeb -- open file explorer or Cozy Drive Web at parent's path
    | ShowHelp


same : UserAlert -> UserAlert -> Bool
same alertA alertB =
    case ( alertA, alertB ) of
        ( SynchronizationError codeA a, SynchronizationError codeB b ) ->
            a.seq == b.seq && codeA == codeB

        ( RemoteWarning codeA _, RemoteWarning codeB _ ) ->
            codeA == codeB

        _ ->
            False



--Read or write to and from Ports


port userAlertDetails : EncodedUserAlert -> Cmd msg


port userActionInProgress : EncodedUserAlert -> Cmd msg


port userActionCommand : ( EncodedCommand, EncodedUserAlert ) -> Cmd msg


showDetails : UserAlert -> Cmd msg
showDetails alert =
    userAlertDetails (encode alert)


start : UserAlert -> Cmd msg
start alert =
    userActionInProgress (encode alert)


sendCommand : Command -> UserAlert -> Cmd msg
sendCommand cmd alert =
    case cmd of
        ShowDetails ->
            showDetails alert

        _ ->
            userActionCommand ( encodeCommand cmd, encode alert )


type alias EncodedUserAlert =
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


decode : EncodedUserAlert -> Maybe UserAlert
decode { seq, status, code, side, doc, links } =
    let
        decodedStatus =
            decodeUserActionStatus status
    in
    case ( doc, links, seq ) of
        ( _, Just { self }, _ ) ->
            Just (RemoteWarning code { status = decodedStatus, link = self })

        ( Just { docType, path }, _, Just num ) ->
            Just
                (SynchronizationError code
                    { status = decodedStatus
                    , seq = num
                    , docType = docType
                    , path = path
                    , side = decodedSide side
                    }
                )

        _ ->
            Just (RemoteError code)


encode : UserAlert -> EncodedUserAlert
encode alert =
    case alert of
        SynchronizationError code a ->
            { seq = Just a.seq
            , status = encodeUserActionStatus a.status
            , code = code
            , side = encodedSide a.side
            , doc = Just { docType = a.docType, path = a.path }
            , links = Nothing
            }

        RemoteError code ->
            { seq = Nothing
            , status = encodeUserActionStatus Required -- really articial here
            , code = code
            , side = Nothing
            , doc = Nothing
            , links = Nothing
            }

        RemoteWarning code a ->
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


type alias UserAlertView =
    { title : String, content : List String, buttons : List (Html Msg) }


type ButtonType
    = Primary
    | Secondary
    | PrimaryWithDanger
    | SecondaryWithDanger


view : Helpers -> Platform -> UserAlert -> Html Msg
view helpers platform alert =
    let
        { title, content, buttons } =
            viewByCode helpers alert

        side =
            case alert of
                SynchronizationError _ a ->
                    a.side

                _ ->
                    Nothing
    in
    div [ class "u-p-1 u-bg-paleGrey" ]
        [ header [ class "u-title-h1" ] [ text (helpers.t title) ]
        , p [ class "u-text" ] (alertContent helpers platform content side)
        , div [ class "u-flex u-flex-justify-end" ] buttons
        ]


viewByCode : Helpers -> UserAlert -> UserAlertView
viewByCode helpers alert =
    case alert of
        RemoteError "UnknownRemoteError" ->
            { title = "Error Unexpected error"
            , content =
                [ "Error Cozy Desktop encountered an unexpected error while trying to reach your Cozy."
                , "Error Your hosting provider is working on fixing the issue and the synchronization will resume once it is fixed."
                ]
            , buttons =
                [ actionButton helpers ShowHelp "Button Contact support" Secondary
                , actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Primary
                ]
            }

        RemoteError "RemoteMaintenance" ->
            { title = "Error Maintenance in progress"
            , content =
                [ "Error The synchronization of your documents is momentarily paused."
                , "Error It will resume once the maintenance is over."
                ]
            , buttons =
                [ actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Primary ]
            }

        RemoteError _ ->
            { title = "", content = [], buttons = [] }

        RemoteWarning "UserActionRequired" { link } ->
            { title = "CGUUpdated The ToS have been updated"
            , content =
                [ "CGUUpdated Your Cozy hosting provider informs you that it has updated its Terms of Service (ToS)."
                , "CGUUpdated Their acceptance is required to continue using your Cozy."
                ]
            , buttons =
                [ actionButton helpers (SendCommand Retry alert) "UserAlert OK" Secondary
                , linkButton helpers link "CGUUpdated Read the new ToS" Primary
                ]
            }

        RemoteWarning _ _ ->
            { title = "", content = [], buttons = [] }

        SynchronizationError "ConflictingName" { docType, path } ->
            let
                localDocType =
                    "Helpers " ++ docType

                localAction =
                    helpers.interpolate [ localDocType ] "UserAlert Rename {0}"
            in
            { title = "Error Conflict with existing document"
            , content =
                [ helpers.interpolate [ localDocType, path ] "Error The name of {0} `{1}` is conflicting with an existing document."
                , helpers.interpolate [ localDocType ] "Error You need to rename this {0} to solve the conflict."
                ]
            , buttons =
                [ actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Secondary
                , actionButton helpers (SendCommand CreateConflict alert) localAction Primary
                ]
            }

        SynchronizationError "ExcludedDir" { path } ->
            let
                localAction =
                    helpers.interpolate [ "Helpers folder" ] "UserAlert Rename {0}"
            in
            { title = "Error Conflict with excluded directory"
            , content =
                [ helpers.interpolate [ path ] "Error The remote directory `{0}` was excluded from the synchronization on this device."
                , "Error The local directory with the same path can either be linked to the remote one which will be synchronized again or be renamed to solve this conflict."
                ]
            , buttons =
                [ actionButton helpers (SendCommand CreateConflict alert) localAction Secondary
                , actionButton helpers (SendCommand LinkDirectories alert) "UserAlert Link directories" Primary
                ]
            }

        SynchronizationError "FileTooLarge" { path } ->
            { title = "Error The file is too large"
            , content =
                [ helpers.interpolate [ path ] "Error The file `{0}` could not be synchronized on your Cozy because its size exceeds the maximum allowed of 5 GiB."
                , "Error It will therefore not be synchronized. To stop being notified, you can click on the button below."
                ]
            , buttons =
                [ actionButton helpers (SendCommand GiveUp alert) "UserAlert Got it" Primary ]
            }

        SynchronizationError "IncompatibleDoc" { docType, path } ->
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
                [ actionButton helpers (SendCommand ShowDetails alert) "UserAlert Show details" Secondary
                , actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Primary
                ]
            }

        SynchronizationError "InvalidMetadata" { docType, path } ->
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
                [ actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Primary
                ]
            }

        SynchronizationError "InvalidName" { docType, path } ->
            let
                localDocType =
                    "Helpers " ++ docType
            in
            { title = "Error Invalid document name"
            , content =
                [ helpers.interpolate [ localDocType, path ] "Error The {0} `{1}`'s name contains characters forbidden by your Cozy."
                , "Error Try renaming it without using the following characters: / \\u{0000} \\n \\u{000D}."
                ]
            , buttons = [ actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Primary ]
            }

        SynchronizationError "MissingPermissions" { docType, path } ->
            let
                localDocType =
                    "Helpers " ++ docType
            in
            { title = "Error Access denied temporarily"
            , content =
                [ helpers.interpolate [ localDocType, path ] "Error The {0} `{1}` could not be updated on your computer to apply the changes made on your Cozy."
                , "Error Synchronization will resume as soon as you close the opened file(s) blocking this operation or restore sufficient access rights."
                ]
            , buttons = [ actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Primary ]
            }

        SynchronizationError "NeedsRemoteMerge" { docType, path } ->
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
                [ actionButton helpers (SendCommand GiveUp alert) "UserAlert Give up" SecondaryWithDanger
                , actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Primary
                ]
            }

        SynchronizationError "NoCozySpace" { docType, path } ->
            let
                localDocType =
                    "Helpers " ++ docType
            in
            { title = "Error Your Cozy's disk space is saturated"
            , content =
                [ helpers.interpolate [ localDocType, path ] "Error The {0} `{1}` could not be written to your Cozy's disk because its maximum storage capacity has been reached."
                , "Error Synchronization will resume as soon as you have freed up space (emptied your Trash, deleted unnecessary files...), or increased its capacity."
                ]
            , buttons = [ actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Primary ] -- Could show link to buy more disk space
            }

        SynchronizationError "NoDiskSpace" { docType, path } ->
            let
                localDocType =
                    "Helpers " ++ docType
            in
            { title = "Error Your computer's disk space is insufficient"
            , content =
                [ helpers.interpolate [ localDocType, path ] "Error The {0} `{1}` could not be written to your computer disk because there is not enough space available."
                , "Error Synchronization will resume as soon as you have freed up space (emptied your Trash, deleted unnecessary files…)."
                ]
            , buttons = [ actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Primary ]
            }

        SynchronizationError "PathTooDeep" { docType, path } ->
            let
                localDocType =
                    "Helpers " ++ docType
            in
            { title = "Error Document path with too many levels"
            , content =
                [ helpers.interpolate [ localDocType, path ] "Error The {0} `{1}`'s path has too many levels (i.e. parent folders) for your Cozy."
                , "Error Try removing some parent levels or moving it to antoher folder."
                ]
            , buttons = [ actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Primary ]
            }

        SynchronizationError "RemoteMaintenance" _ ->
            { title = "Error Maintenance in progress"
            , content =
                [ "Error The synchronization of your documents is momentarily paused."
                , "Error It will resume once the maintenance is over."
                ]
            , buttons =
                [ actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Primary ]
            }

        SynchronizationError "UnknownRemoteError" { docType, path } ->
            let
                localDocType =
                    "Helpers " ++ docType
            in
            { title = "Error Synchronization error"
            , content =
                [ helpers.interpolate [ localDocType, path ] "Error Cozy Desktop encountered an unexpected error while trying to synchronise the {0} `{1}`."
                , "Error Your hosting provider is working on fixing the issue and the synchronization will automatically be retried periodically."
                ]
            , buttons =
                [ actionButton helpers ShowHelp "Button Contact support" Secondary
                , actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Primary
                ]
            }

        SynchronizationError _ _ ->
            { title = "", content = [], buttons = [] }


alertContent : Helpers -> Platform -> List String -> Maybe Side -> List (Html Msg)
alertContent helpers platform details side =
    details
        |> List.map helpers.capitalize
        |> List.map (viewAlertContentLine platform side)
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
                    [ "c-btn--secondary" ]

                PrimaryWithDanger ->
                    [ "c-btn--danger" ]

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


viewAlertContentLine : Platform -> Maybe Side -> String -> List (Html Msg)
viewAlertContentLine platform side line =
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

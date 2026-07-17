port module Data.UserAlert exposing
    ( Command(..)
    , EncodedUserAlert
    , Msg(..)
    , UserAlert(..)
    , decode
    , same
    , sendCommand
    , showDetails
    , view
    )

import Data.File as File
import Data.Path as Path exposing (Path)
import Data.Platform as Platform exposing (Platform)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import I18n exposing (Helpers)
import Icons
import Time
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
    { status : UserActionStatus, seq : Int, id : String, docType : String, path : String, side : Maybe Side, prereqPath : Maybe String, lastSeenAt : Time.Posix }


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
    | ShowInParent Path ShowInWeb -- open file explorer or web Twake Drive at parent's path
    | ShowHelp
    | OpenFile Path ShowInWeb


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


port userActionCommand : ( EncodedCommand, EncodedUserAlert ) -> Cmd msg


showDetails : UserAlert -> Cmd msg
showDetails alert =
    userAlertDetails (encode alert)


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
            { id : String
            , docType : String
            , path : String
            }
    , links :
        Maybe
            { self : String
            }
    , prereqPath : Maybe String
    , lastSeenAt : Maybe Int
    }


type alias EncodedCommand =
    String


decode : EncodedUserAlert -> Maybe UserAlert
decode { seq, status, code, side, doc, links, prereqPath, lastSeenAt } =
    let
        decodedStatus =
            decodeUserActionStatus status

        decodedLastSeenAt =
            Maybe.withDefault (Time.millisToPosix 0) (Maybe.map Time.millisToPosix lastSeenAt)
    in
    case ( doc, links, seq ) of
        ( _, Just { self }, _ ) ->
            Just (RemoteWarning code { status = decodedStatus, link = self })

        ( Just { id, docType, path }, _, Just num ) ->
            Just
                (SynchronizationError code
                    { status = decodedStatus
                    , seq = num
                    , id = id
                    , docType = docType
                    , path = path
                    , side = decodedSide side
                    , prereqPath = prereqPath
                    , lastSeenAt = decodedLastSeenAt
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
            , doc = Just { id = a.id, docType = a.docType, path = a.path }
            , links = Nothing
            , prereqPath = a.prereqPath
            , lastSeenAt = Just (Time.posixToMillis a.lastSeenAt)
            }

        RemoteError code ->
            { seq = Nothing
            , status = encodeUserActionStatus Required -- really articial here
            , code = code
            , side = Nothing
            , doc = Nothing
            , links = Nothing
            , prereqPath = Nothing
            , lastSeenAt = Nothing
            }

        RemoteWarning code a ->
            { seq = Nothing
            , status = encodeUserActionStatus a.status
            , code = code
            , side = Nothing
            , links = Just { self = a.link }
            , doc = Nothing
            , prereqPath = Nothing
            , lastSeenAt = Nothing
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


view : Helpers -> Platform -> Time.Posix -> UserAlert -> Html Msg
view helpers platform now alert =
    case alert of
        SynchronizationError _ info ->
            viewSyncError helpers platform now alert info

        RemoteError _ ->
            viewRemoteError helpers platform now alert

        RemoteWarning _ _ ->
            viewRemoteError helpers platform now alert


viewSyncError : Helpers -> Platform -> Time.Posix -> UserAlert -> SynchronizationErrorInfo -> Html Msg
viewSyncError helpers platform now alert info =
    let
        { title, content, buttons } =
            viewByCode helpers alert

        path =
            Path.fromString platform info.path

        ( basename, extname ) =
            File.splitName (Path.name path)

        dirPath =
            Path.parent path

        icon =
            if info.docType == "directory" then
                "folder"

            else
                info.docType

        medium =
            case info.side of
                -- Open on the side opposite of the one on which the change is
                -- being applied.
                Just Local ->
                    inWeb

                _ ->
                    onOS

        timeAgo =
            helpers.distance_of_time_in_words info.lastSeenAt now
    in
    div
        [ class "alert-line" ]
        [ span [ class "file-alert-icon" ]
            [ div [ class ("file-type file-type-" ++ icon) ] []
            , span [ class "badge" ] [ text "!" ]
            ]
        , span
            [ class "file-line-content file-name-wrapper u-c-pointer"
            , Html.Attributes.title (Path.toString path)
            , onClick (OpenFile path medium)
            ]
            [ span [ class "file-name-name" ] [ text basename ]
            , span [ class "file-name-ext" ] [ text extname ]
            , span [ class "file-name-open" ] [ Icons.openwith 12 False ]
            ]
        , span [ class "file-line-content file-extra" ]
            [ span [ class "file-time-ago" ] [ text timeAgo ]
            , span
                [ class "file-parent-folder u-c-pointer"
                , Html.Attributes.title (Path.toString dirPath)
                , onClick (ShowInParent path medium)
                ]
                [ text (Path.toString dirPath) ]
            ]
        , span [ class "file-line-content u-spacenormal u-errorColorDark u-mt-half" ]
            (alertContent helpers platform content)
        , div [ class "u-flex u-mt-half u-pb-1" ] buttons
        ]


viewRemoteError : Helpers -> Platform -> Time.Posix -> UserAlert -> Html Msg
viewRemoteError helpers platform now alert =
    let
        { title, content, buttons } =
            viewByCode helpers alert
    in
    div
        [ class "alert-line" ]
        [ span [ class "file-alert-icon" ]
            [ div [ class "file-type file-type-system-error" ] []
            ]
        , span [ class "file-line-content file-name-wrapper" ]
            [ span [ class "file-name-name" ] [ text (helpers.t title) ]
            ]
        , span [ class "file-line-content file-extra" ]
            [ span [ class "file-parent-folder" ] [ text (helpers.t "UserAlert System") ]
            ]
        , span [ class "file-line-content u-spacenormal u-errorColorDark u-mt-half" ]
            (alertContent helpers platform content)
        , div [ class "u-flex u-mt-half u-pb-1" ] buttons
        ]


viewByCode : Helpers -> UserAlert -> UserAlertView
viewByCode helpers alert =
    case alert of
        RemoteError "UnknownRemoteError" ->
            { title = "Error Unexpected error"
            , content =
                [ "Error Twake Desktop encountered an unexpected error while trying to reach your Twake Workplace."
                , "Error Your hosting provider is working on fixing the issue and the synchronization will resume once it is fixed."
                ]
            , buttons =
                [ actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Primary
                , actionButton helpers ShowHelp "Button Contact support" Secondary
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
                [ "CGUUpdated Your Twake Workplace hosting provider informs you that it has updated its Terms of Service (ToS)."
                , "CGUUpdated Their acceptance is required to continue using your Twake Workplace."
                ]
            , buttons =
                [ linkButton helpers link "CGUUpdated Read the new ToS" Primary
                , actionButton helpers (SendCommand Retry alert) "UserAlert OK" Secondary
                ]
            }

        RemoteWarning _ _ ->
            { title = "", content = [], buttons = [] }

        SynchronizationError "ConflictingName" { docType } ->
            let
                localDocType =
                    localDocTypeLabel docType

                localAction =
                    helpers.interpolate [ localDocType ] "UserAlert Rename {0}"
            in
            { title = "Error Conflict with existing document"
            , content =
                [ helpers.interpolate [ localDocType ] "Error The {0}'s name is conflicting with an existing document."
                , helpers.interpolate [ localDocType ] "Error You need to rename this {0} to solve the conflict."
                ]
            , buttons =
                [ actionButton helpers (SendCommand CreateConflict alert) localAction Primary
                , actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Secondary
                ]
            }

        SynchronizationError "ExcludedDir" { docType } ->
            let
                localAction =
                    helpers.interpolate [ localDocTypeLabel docType ] "UserAlert Rename {0}"
            in
            { title = "Error Conflict with excluded directory"
            , content =
                [ "Error The remote directory was excluded from the synchronization on this device."
                , "Error The local directory with the same path can either be linked to the remote one which will be synchronized again or be renamed to solve this conflict."
                ]
            , buttons =
                [ actionButton helpers (SendCommand LinkDirectories alert) "UserAlert Link directories" Primary
                , actionButton helpers (SendCommand CreateConflict alert) localAction Secondary
                ]
            }

        SynchronizationError "FileTooLarge" _ ->
            { title = "Error The file is too large"
            , content =
                [ "Error The file could not be synchronized on your Twake Workplace because its size exceeds the maximum allowed of 5 GiB."
                , "Error It will therefore not be synchronized. To stop being notified, you can click on the button below."
                ]
            , buttons =
                [ actionButton helpers (SendCommand GiveUp alert) "UserAlert Got it" Primary ]
            }

        SynchronizationError "IncompatibleDoc" { docType } ->
            let
                localDocType =
                    localDocTypeLabel docType
            in
            { title = "Error Document path incompatible with current OS"
            , content =
                [ helpers.interpolate [ localDocType ] "Error The {0}'s name either contains forbidden characters or is reserved or is too long for your Operating System."
                , "Error Try renaming it on Twake Drive without using special characters and choose a shorter name if necessary."
                ]
            , buttons =
                [ actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Primary
                , actionButton helpers (SendCommand ShowDetails alert) "UserAlert Show details" Secondary
                ]
            }

        SynchronizationError "InvalidMetadata" { docType } ->
            let
                localDocType =
                    localDocTypeLabel docType
            in
            { title = "Error Invalid document metadata"
            , content =
                [ helpers.interpolate [ localDocType ] "Error The {0}'s metadata cannot be accepted by your Twake Workplace."
                , "Error This message persists if the local metadata of your document is corrupted. In this case try to move it out of the Twake folder and back again or contact support for help on the procedure."
                ]
            , buttons =
                [ actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Primary
                ]
            }

        SynchronizationError "InvalidName" { docType } ->
            let
                localDocType =
                    localDocTypeLabel docType
            in
            { title = "Error Invalid document name"
            , content =
                [ helpers.interpolate [ localDocType ] "Error The {0}'s name contains characters forbidden by your Twake Workplace."
                , "Error Try renaming it without using the following characters: / \\u{0000} \\n \\u{000D}."
                ]
            , buttons = [ actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Primary ]
            }

        SynchronizationError "MissingPermissions" { docType } ->
            let
                localDocType =
                    localDocTypeLabel docType
            in
            { title = "Error Access denied temporarily"
            , content =
                [ helpers.interpolate [ localDocType ] "Error The {0} could not be updated on your computer to apply the changes made on your Twake Workplace."
                , "Error Synchronization will resume as soon as you close the opened file(s) blocking this operation or restore sufficient access rights."
                ]
            , buttons = [ actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Primary ]
            }

        SynchronizationError "NeedsRemoteMerge" { docType } ->
            let
                localDocType =
                    localDocTypeLabel docType
            in
            { title = "Error Conflict with remote version"
            , content =
                [ helpers.interpolate [ localDocType ] "Error The {0} has been simultaneously modified on your computer and your Twake Workplace."
                , "Error This message persists if Twake Desktop is unable to resolve this conflict. In this case rename the version you want to keep and click on \"Give up\"."
                ]
            , buttons =
                [ actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Primary
                , actionButton helpers (SendCommand GiveUp alert) "UserAlert Give up" SecondaryWithDanger
                ]
            }

        SynchronizationError "NoCozySpace" { docType } ->
            let
                localDocType =
                    localDocTypeLabel docType
            in
            { title = "Error Your Twake Workplace's disk space is saturated"
            , content =
                [ helpers.interpolate [ localDocType ] "Error The {0} could not be written to your Twake Workplace because its maximum storage capacity has been reached."
                , "Error Synchronization will resume as soon as you have freed up space (emptied your Trash, deleted unnecessary files...), or increased its capacity."
                ]
            , buttons = [ actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Primary ] -- Could show link to buy more disk space
            }

        SynchronizationError "NoDiskSpace" { docType } ->
            let
                localDocType =
                    localDocTypeLabel docType
            in
            { title = "Error Your computer's disk space is insufficient"
            , content =
                [ helpers.interpolate [ localDocType ] "Error The {0} could not be written to your computer disk because there is not enough space available."
                , "Error Synchronization will resume as soon as you have freed up space (emptied your Trash, deleted unnecessary files…)."
                ]
            , buttons = [ actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Primary ]
            }

        SynchronizationError "PathTooDeep" { docType } ->
            let
                localDocType =
                    localDocTypeLabel docType
            in
            { title = "Error Document path with too many levels"
            , content =
                [ helpers.interpolate [ localDocType ] "Error The {0}'s path has too many levels (i.e. parent folders) for your Twake Workplace."
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

        SynchronizationError "SkippedDependency" { prereqPath } ->
            { title = "Error Skipped dependency"
            , content =
                [ Maybe.withDefault "" prereqPath
                    |> (\p -> helpers.interpolate [ p ] "Error Change skipped: a prerequisite change on `{0}` was skipped.")
                ]
            , buttons = []
            }

        SynchronizationError "UnknownRemoteError" { docType } ->
            let
                localDocType =
                    localDocTypeLabel docType
            in
            { title = "Error Synchronization error"
            , content =
                [ helpers.interpolate [ localDocType ] "Error Twake Desktop encountered an unexpected error while trying to synchronise the {0}."
                , "Error Your hosting provider is working on fixing the issue and the synchronization will automatically be retried periodically."
                ]
            , buttons =
                [ actionButton helpers (SendCommand Retry alert) "UserAlert Retry" Primary
                , actionButton helpers ShowHelp "Button Contact support" Secondary
                ]
            }

        SynchronizationError _ _ ->
            { title = "", content = [], buttons = [] }


localDocTypeLabel : String -> String
localDocTypeLabel docType =
    if docType == "directory" then
        "Helpers folder"

    else
        "Helpers file"


alertContent : Helpers -> Platform -> List String -> List (Html Msg)
alertContent helpers platform details =
    details
        |> List.map helpers.capitalize
        |> List.map (viewActionContentLine platform)
        |> List.intersperse (br [] [])


viewActionContentLine : Platform -> String -> Html Msg
viewActionContentLine platform line =
    let
        toHTML =
            \decoration ->
                case decoration of
                    Decorated path ->
                        Path.fromString platform path
                            |> decoratedName

                    Normal str ->
                        text str
    in
    span []
        (findDecorations line
            |> List.map toHTML
        )


decoratedName : Path -> Html Msg
decoratedName path =
    span
        [ class "u-bg-frenchPass u-bdrs-4 u-ph-half u-pv-0 u-c-pointer"
        , title (Path.toString path)
        , onClick (ShowInParent path onOS)
        ]
        [ text (Path.name path) ]


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
    "alert-btn"
        ++ (case bType of
                Primary ->
                    " alert-btn--primary"

                Secondary ->
                    ""

                PrimaryWithDanger ->
                    " alert-btn--danger"

                SecondaryWithDanger ->
                    " alert-btn--danger-light"
           )


actionButton : Helpers -> Msg -> String -> ButtonType -> Html Msg
actionButton helpers msg label bType =
    button
        [ class (buttonClass bType)
        , onClick msg
        ]
        [ span [ class "alert-btn-icon" ] [ iconForMsg msg ]
        , text (helpers.t label)
        ]


iconForMsg : Msg -> Html Msg
iconForMsg msg =
    case msg of
        ShowHelp ->
            Icons.help 12 False

        SendCommand cmd _ ->
            case cmd of
                Retry ->
                    Icons.sync 12 False

                CreateConflict ->
                    Icons.pen 12 False

                LinkDirectories ->
                    Icons.link 12 False

                GiveUp ->
                    Icons.cross 12 False

                ShowDetails ->
                    Icons.info 12 False

        _ ->
            text ""


linkButton : Helpers -> String -> String -> ButtonType -> Html Msg
linkButton helpers link label bType =
    a
        [ class (buttonClass bType)
        , href link
        ]
        [ span [ class "alert-btn-icon" ] [ Icons.openwith 12 False ]
        , text (helpers.t label)
        ]

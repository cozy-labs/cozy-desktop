port module Data.UserAction exposing
    ( EncodedUserAction
    , Msg(..)
    , UserAction(..)
    , decode
    , encode
    , end
    , same
    , showDetails
    , skip
    , start
    , view
    )

import Data.Path as Path exposing (Path)
import Data.Platform as Platform exposing (Platform)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Locale exposing (Helpers)
import Regex
import Util.List as List


type UserAction
    = ClientAction String ClientActionInfo
    | RemoteAction String RemoteActionInfo


type UserActionStatus
    = Required
    | InProgress
    | Done


type alias ClientActionInfo =
    { status : UserActionStatus, seq : Int, docType : String, path : String }


type alias RemoteActionInfo =
    { status : UserActionStatus, link : String }


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


port userActionDone : EncodedUserAction -> Cmd msg


port userActionInProgress : EncodedUserAction -> Cmd msg


port userActionSkipped : EncodedUserAction -> Cmd msg


showDetails : UserAction -> Cmd msg
showDetails action =
    userActionDetails (encode action)


end : UserAction -> Cmd msg
end action =
    userActionDone (encode action)


start : UserAction -> Cmd msg
start action =
    userActionInProgress (encode action)


skip : UserAction -> Cmd msg
skip action =
    userActionSkipped (encode action)


type alias EncodedUserAction =
    { seq : Maybe Int
    , status : String
    , code : String
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


decode : EncodedUserAction -> Maybe UserAction
decode { seq, status, code, doc, links } =
    let
        decodedStatus =
            decodeUserActionStatus status
    in
    case ( doc, links, seq ) of
        ( _, Just { self }, _ ) ->
            Just (RemoteAction code { status = decodedStatus, link = self })

        ( Just { docType, path }, _, Just num ) ->
            Just (ClientAction code { status = decodedStatus, seq = num, docType = docType, path = path })

        _ ->
            Nothing


encode : UserAction -> EncodedUserAction
encode action =
    case action of
        ClientAction code a ->
            { seq = Just a.seq
            , status = encodeUserActionStatus a.status
            , code = code
            , doc = Just { docType = a.docType, path = a.path }
            , links = Nothing
            }

        RemoteAction code a ->
            { seq = Nothing
            , status = encodeUserActionStatus a.status
            , code = code
            , links = Just { self = a.link }
            , doc = Nothing
            }


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



-- View User Action from other modules


type Msg
    = GiveUp UserAction
    | Retry UserAction
    | ShowDetails UserAction
    | ShowInParent Path


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
    in
    div [ class "u-p-1 u-bg-paleGrey" ]
        [ header [ class "u-title-h1" ] [ text (helpers.t title) ]
        , p [ class "u-text" ] (actionContent helpers platform content)
        , div [ class "u-flex u-flex-justify-end" ] buttons
        ]


viewByCode : Helpers -> UserAction -> UserActionView
viewByCode helpers action =
    case action of
        ClientAction "FileTooLarge" { path } ->
            { title = "Error The file is too large"
            , content =
                [ helpers.interpolate [ path ] "Error The file `{0}` could not be written to your Cozy's disk because it is larger than the maximum file size allowed by your Cozy: 5 GiB."
                , "Error You need to remove it from your local synchronization folder or reduce its size."
                ]
            , buttons =
                [ actionButton helpers (GiveUp action) "UserAction Give up" Primary ]
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
                [ actionButton helpers (ShowDetails action) "UserAction Show details" Secondary
                , actionButton helpers (Retry action) "UserAction Retry" Primary
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
                [ actionButton helpers (Retry action) "UserAction Retry" Primary
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
            , buttons = [ actionButton helpers (Retry action) "UserAction Retry" Primary ]
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
            , buttons = [ actionButton helpers (Retry action) "UserAction Retry" Primary ]
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
                [ actionButton helpers (GiveUp action) "UserAction Give up" SecondaryWithDanger
                , actionButton helpers (Retry action) "UserAction Retry" Primary
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
            , buttons = [ actionButton helpers (Retry action) "UserAction Retry" Primary ] -- Could show link to buy more disk space
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
            , buttons = [ actionButton helpers (Retry action) "UserAction Retry" Primary ]
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
            , buttons = [ actionButton helpers (Retry action) "UserAction Retry" Primary ]
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
            , buttons = [ actionButton helpers (Retry action) "UserAction Retry" Primary ] -- Could show help button
            }

        RemoteAction "UserActionRequired" { link } ->
            { title = "CGUUpdated The ToS have been updated"
            , content =
                [ "CGUUpdated Your Cozy hosting provider informs you that it has updated its Terms of Service (ToS)."
                , "CGUUpdated Their acceptance is required to continue using your Cozy."
                ]
            , buttons =
                [ actionButton helpers (Retry action) "UserAction Ok" Secondary
                , linkButton helpers link "CGUUpdated Read the new ToS" Primary
                ]
            }

        ClientAction _ _ ->
            { title = "", content = [], buttons = [] }

        RemoteAction _ _ ->
            { title = "", content = [], buttons = [] }


actionContent : Helpers -> Platform -> List String -> List (Html Msg)
actionContent helpers platform details =
    details
        |> List.map helpers.capitalize
        |> List.map (viewActionContentLine platform)
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


viewActionContentLine : Platform -> String -> List (Html Msg)
viewActionContentLine platform line =
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

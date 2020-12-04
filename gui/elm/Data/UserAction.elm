module Data.UserAction exposing
    ( EncodedUserAction
    , UserAction(..)
    , decode
    , details
    , encode
    , getLink
    , inProgress
    , primaryLabel
    , same
    , title
    )


type UserActionStatus
    = Required
    | InProgress


type UserAction
    = UserAction UserActionStatus RemoteActionInfo


type alias RemoteActionInfo =
    { code : String, link : String }


same : UserAction -> UserAction -> Bool
same (UserAction _ a) (UserAction _ b) =
    a.code == b.code



--Read or write to and from Ports


type alias EncodedUserAction =
    { status : String
    , code : String
    , links :
        Maybe
            { self : String
            }
    }


decode : EncodedUserAction -> Maybe UserAction
decode { status, code, links } =
    let
        decodedStatus =
            decodeUserActionStatus status
    in
    case links of
        Just { self } ->
            Just (UserAction decodedStatus { code = code, link = self })

        _ ->
            Nothing


encode : UserAction -> EncodedUserAction
encode (UserAction s a) =
    { status = encodeUserActionStatus s
    , code = a.code
    , links = Just { self = a.link }
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



-- View User Action from other modules


getCode : UserAction -> String
getCode (UserAction _ { code }) =
    code


getLink : UserAction -> String
getLink (UserAction _ { link }) =
    link


inProgress : UserAction -> Bool
inProgress (UserAction status _) =
    status == InProgress


title : UserAction -> String
title action =
    let
        strings =
            userActionStrings (getCode action)
    in
    strings.title


details : UserAction -> String
details action =
    let
        strings =
            userActionStrings (getCode action)
    in
    strings.details


primaryLabel : UserAction -> String
primaryLabel action =
    let
        { label } =
            userActionStrings (getCode action)
    in
    case ( action, label ) of
        ( _, Just l ) ->
            l

        ( _, Nothing ) ->
            "UserAction Read"



-- Translation chains used in interface


type alias UserActionStrings =
    { title : String, details : String, label : Maybe String }


userActionStrings : String -> UserActionStrings
userActionStrings code =
    case code of
        "UserActionRequired" ->
            { title = "CGUUpdated Cozy has updated its ToS"
            , details = "CGUUpdated In accordance with the RGPD, Cozy informs you of changes to its Terms of Service. Accepting the new ToS is required to keep using your Cozy."
            , label = Just "CGUUpdated Read the new ToS"
            }

        _ ->
            { title = "", details = "", label = Nothing }

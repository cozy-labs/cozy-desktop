module Data.UserAction exposing
    ( EncodedUserAction
    , Interaction(..)
    , UserAction(..)
    , decode
    , details
    , encode
    , getLink
    , inProgress
    , primaryInteraction
    , same
    , secondaryInteraction
    , title
    )


type UserActionStatus
    = Required
    | InProgress


type UserAction
    = ClientAction UserActionStatus ClientActionInfo
    | RemoteAction UserActionStatus RemoteActionInfo


type alias ClientActionInfo =
    { code : String, docType : String, path : String }


type alias RemoteActionInfo =
    { code : String, link : String }


same : UserAction -> UserAction -> Bool
same actionA actionB =
    case ( actionA, actionB ) of
        ( ClientAction _ a, ClientAction _ b ) ->
            a.code == b.code

        ( RemoteAction _ a, RemoteAction _ b ) ->
            a.code == b.code

        _ ->
            False



--Read or write to and from Ports


type alias EncodedUserAction =
    { status : String
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
decode { status, code, doc, links } =
    let
        decodedStatus =
            decodeUserActionStatus status
    in
    case ( doc, links ) of
        ( Just { docType, path }, Just { self } ) ->
            Just (RemoteAction decodedStatus { code = code, link = self })

        ( Just { docType, path }, _ ) ->
            Just (ClientAction decodedStatus { code = code, docType = docType, path = path })

        ( _, Just { self } ) ->
            Just (RemoteAction decodedStatus { code = code, link = self })

        _ ->
            Nothing


encode : UserAction -> EncodedUserAction
encode action =
    case action of
        ClientAction s a ->
            { status = encodeUserActionStatus s
            , code = a.code
            , doc = Just { docType = a.docType, path = a.path }
            , links = Nothing
            }

        RemoteAction s a ->
            { status = encodeUserActionStatus s
            , code = a.code
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



-- View User Action from other modules


getCode : UserAction -> String
getCode action =
    case action of
        ClientAction _ { code } ->
            code

        RemoteAction _ { code } ->
            code


getLink : UserAction -> Maybe String
getLink action =
    case action of
        RemoteAction _ { link } ->
            Just link

        ClientAction _ _ ->
            Nothing


inProgress : UserAction -> Bool
inProgress action =
    case action of
        RemoteAction status _ ->
            status == InProgress

        ClientAction status _ ->
            status == InProgress


title : UserAction -> String
title action =
    let
        strings =
            view (getCode action)
    in
    strings.title


details : UserAction -> List ( String, List String )
details action =
    let
        strings =
            view (getCode action)

        interpolations =
            case action of
                ClientAction _ { docType, path } ->
                    [ "Helpers " ++ docType, path ]

                RemoteAction _ _ ->
                    []
    in
    List.map (\line -> ( line, interpolations )) strings.details


primaryInteraction : UserAction -> Interaction
primaryInteraction action =
    let
        strings =
            view (getCode action)
    in
    strings.primaryInteraction


secondaryInteraction : UserAction -> Maybe Interaction
secondaryInteraction action =
    let
        strings =
            view (getCode action)
    in
    strings.secondaryInteraction



-- Translation chains used in interface


type Interaction
    = Retry String
    | Open String
    | Ok
    | GiveUp


type alias UserActionView =
    { title : String
    , details : List String
    , primaryInteraction : Interaction
    , secondaryInteraction : Maybe Interaction
    , label : Maybe String
    }


view : String -> UserActionView
view code =
    case code of
        "MissingPermissions" ->
            { title = "Error Access denied temporarily"
            , details =
                [ "Error The {0} `{1}` could not be updated on your computer to apply the changes made on your Cozy."
                , "Error Synchronization will resume as soon as you close the opened file(s) blocking this operation or restore sufficient access rights."
                ]
            , primaryInteraction = Retry "UserAction Retry"
            , secondaryInteraction = Nothing
            , label = Nothing
            }

        "NoDiskSpace" ->
            { title = "Error Your computer's disk space is insufficient"
            , details =
                [ "Error The {0} `{1}` could not be written to your computer disk because there is not enough space available."
                , "Error Synchronization will resume as soon as you have freed up space (emptied your Trash, deleted unnecessary files…)."
                ]
            , primaryInteraction = Retry "UserAction Retry"
            , secondaryInteraction = Nothing
            , label = Nothing
            }

        "NoCozySpace" ->
            { title = "Error Your Cozy's disk space is saturated"
            , details =
                [ "Error The {0} `{1}` could not be written to your Cozy's disk because its maximum storage capacity has been reached."
                , "Error Synchronization will resume as soon as you have freed up space (emptied your Trash, deleted unnecessary files...), or increased its capacity."
                ]
            , primaryInteraction = Retry "UserAction Retry"
            , secondaryInteraction = Nothing
            , label = Nothing
            }

        "NeedsRemoteMerge" ->
            { title = "Error Conflict with remote version"
            , details =
                [ "Error The {0} `{1}` has been simultaneously modified on your computer and your Cozy."
                , "Error This message persists if Cozy is unable to resolve this conflict. In this case rename the version you want to keep and click on \"Give up\"."
                ]
            , primaryInteraction = Retry "UserAction Retry"
            , secondaryInteraction = Just GiveUp
            , label = Nothing
            }

        "UserActionRequired" ->
            { title = "CGUUpdated The ToS have been updated"
            , details =
                [ "CGUUpdated Your Cozy hosting provider informs you that it has updated its Terms of Service (ToS)."
                , "CGUUpdated Their acceptance is required to continue using your Cozy."
                ]
            , primaryInteraction = Open "CGUUpdated Read the new ToS"
            , secondaryInteraction = Just Ok
            , label = Just "CGUUpdated Read the new ToS"
            }

        _ ->
            { title = ""
            , details = []
            , primaryInteraction = Ok
            , secondaryInteraction = Nothing
            , label = Nothing
            }

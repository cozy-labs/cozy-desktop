module Updater exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Helpers exposing (Helpers)


-- MODEL


type alias Progress =
    { total : Float
    , transferred : Float
    }


type alias Model =
    { version : String
    , progress : Maybe Progress
    }


init : String -> Model
init version =
    { version = version
    , progress = Nothing
    }



-- UPDATE


type Msg
    = UpdateDownloading (Maybe Progress)


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        UpdateDownloading progress ->
            ( { model | progress = progress }, Cmd.none )



-- VIEW


humanReadableDiskValue : Helpers -> Float -> String
humanReadableDiskValue helpers v =
    (toString (round (v / 1000000)) ++ " M" ++ (helpers.t "Account b"))


progressbar : Float -> Html Msg
progressbar ratio =
    let
        cappedRatio =
            (Basics.min 1 ratio)

        percent =
            (toString (cappedRatio * 100)) ++ "%"
    in
        div [ class "progress" ]
            [ div
                [ class "progress-inner"
                , style [ ( "width", percent ) ]
                ]
                []
            ]


view : Helpers -> Model -> Html Msg
view helpers model =
    section [ class "updater" ]
        (case model.progress of
            Just progress ->
                [ h1 [] [ text (helpers.t "Updater Downloading") ]
                , div [ class "spacer" ]
                    [ (progressbar (progress.transferred / progress.total))
                    , div [ class "progress-indicator" ]
                        [ text
                            ((humanReadableDiskValue helpers progress.transferred)
                                ++ " / "
                                ++ (humanReadableDiskValue helpers progress.total)
                            )
                        ]
                    ]
                , p []
                    [ text (helpers.t "Updater Please wait") ]
                ]

            Nothing ->
                [ h1 []
                    [ text (helpers.t "Updater Downloading") ]
                , div [ class "spacer" ]
                    [ div [ class "progress indeterminate" ]
                        [ div
                            [ class "progress-inner" ]
                            []
                        ]
                    ]
                , p []
                    [ text (helpers.t "Updater Please wait") ]
                ]
        )

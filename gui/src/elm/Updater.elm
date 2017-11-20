module Updater exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Helpers exposing (Helpers)


-- MODEL


type alias Progress =
    { total : Float
    , transferred : Float
    }


type State
    = Checking
    | Downloading (Maybe Progress)


type alias Model =
    { version : String
    , state : State
    }


init : String -> Model
init version =
    { version = version
    , state = Checking
    }



-- UPDATE


type Msg
    = UpdateDownloading (Maybe Progress)


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case
        msg
    of
        UpdateDownloading progress ->
            ( { model | state = Downloading progress }, Cmd.none )



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
    case model.state of
        Checking ->
            div [] [ text (helpers.t "Updater Checking for Update") ]

        Downloading (Just progress) ->
            div []
                [ text
                    ((humanReadableDiskValue helpers progress.transferred)
                        ++ " / "
                        ++ (humanReadableDiskValue helpers progress.total)
                    )
                , (progressbar (progress.transferred / progress.total))
                ]

        Downloading Nothing ->
            div []
                [ text (helpers.t "Updater Downloading")
                ]

port module Window.Updater exposing
    ( Model
    , Msg(..)
    , init
    , subscriptions
    , update
    , view
    )

import Data.Progress as Progress exposing (EncodedProgress, Progress)
import Html exposing (..)
import Html.Attributes exposing (..)
import I18n exposing (Helpers)
import Icons
import Ports
import View.ProgressBar as ProgressBar



-- MODEL


type alias Model =
    { version : String
    , progress : Maybe Progress
    , error : Maybe String
    }


init : String -> Model
init version =
    { version = version
    , progress = Nothing
    , error = Nothing
    }



-- UPDATE


type Msg
    = UpdateDownloading (Maybe Progress)
    | UpdateError String


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        UpdateDownloading progress ->
            ( { model | progress = progress }, Cmd.none )

        UpdateError subMsg ->
            ( { model | error = Just subMsg }, Cmd.none )



-- SUBSCRIPTIONS


port updateDownloading : (Maybe EncodedProgress -> msg) -> Sub msg


port updateError : (String -> msg) -> Sub msg


subscriptions : Model -> Sub Msg
subscriptions model =
    Sub.batch
        [ updateDownloading (UpdateDownloading << Maybe.map Progress.decode)
        , updateError UpdateError
        ]



-- VIEW


view : Helpers -> Model -> Html Msg
view helpers model =
    section [ class "updater" ]
        (case ( model.error, model.progress ) of
            ( Just msg, _ ) ->
                [ h1 [] [ text (helpers.t "Updater Error") ]
                , p [] [ text msg ]
                ]

            ( Nothing, Just progress ) ->
                progressView helpers
                    [ ProgressBar.view (Progress.ratio progress)
                    , div
                        [ class "progress-indicator" ]
                        [ text (helpers.human_readable_progress progress) ]
                    ]

            ( Nothing, Nothing ) ->
                progressView helpers
                    [ span [ class "progress-spinner" ] [] ]
        )


progressView : Helpers -> List (Html Msg) -> List (Html Msg)
progressView helpers localProgressBar =
    [ h1 []
        [ figure [ class "logo" ] [ Icons.logo ]
        , text (helpers.t "Updater Downloading")
        ]
    , div [ class "spacer" ]
        localProgressBar
    , p []
        [ strong [] [ text (helpers.t "Updater Please wait") ]
        , br [] []
        , text (helpers.t "Updater It may take a while")
        ]
    ]

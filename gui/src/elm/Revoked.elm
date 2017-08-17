port module Revoked exposing (..)

import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Helpers exposing (Helpers)


-- MODEL


type alias Model =
    { busy : Bool
    }


init : Model
init =
    { busy = False
    }



-- UPDATE


type Msg
    = Logout


port logout : () -> Cmd msg


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case
        msg
    of
        Logout ->
            ( { model | busy = True }, logout () )



-- VIEW


view : Helpers -> Model -> Html Msg
view helpers model =
    section [ class "unlinked" ]
        [ div [ class "spacer" ] []
        , h1 [] [ text (helpers.t "Revoked Access revoked") ]
        , p []
            [ text (helpers.t "Revoked It looks like you have revoked your client from your Cozy")
            , text " "
            , text (helpers.t "Revoked If it wasn't you, contact us at contact@cozycloud.cc")
            ]
        , div [ class "spacer" ] []
        , a
            [ class "btn"
            , href "#"
            , if model.busy then
                attribute "aria-busy" "true"
              else
                onClick Logout
            ]
            [ text (helpers.t "Revoked Log out") ]
        ]

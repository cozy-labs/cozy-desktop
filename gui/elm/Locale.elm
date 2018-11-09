module Locale exposing (DistanceOfTime, Helpers, Locale, NumberToHumanSize, Pluralize, Translate, decodeAll, decoder, distance_of_time_in_words, helpers, interpolate, isSingular, number_to_human_size, pluralize, translate)

import Dict exposing (Dict)
import Json.Decode as Json
import Regex exposing (fromString, replace)
import Time


type alias Locale =
    Dict String String


type alias Translate =
    String -> String


type alias Pluralize =
    Int -> String -> String -> String


type alias DistanceOfTime =
    Time.Posix -> Time.Posix -> String


type alias NumberToHumanSize =
    Int -> String


type alias Helpers =
    { t : Translate
    , pluralize : Pluralize
    , distance_of_time_in_words : DistanceOfTime
    , number_to_human_size : NumberToHumanSize
    }


decoder : Json.Decoder Locale
decoder =
    Json.dict Json.string


decodeAll : Json.Value -> Dict String Locale
decodeAll json =
    case Json.decodeValue (Json.dict decoder) json of
        Ok value ->
            value

        Err _ ->
            Dict.empty


helpers : Locale -> Helpers
helpers locale =
    Helpers (translate locale)
        (pluralize locale)
        (distance_of_time_in_words locale)
        (number_to_human_size locale)


translate : Locale -> Translate
translate locale key =
    case
        Dict.get key locale
    of
        Nothing ->
            key

        Just translation ->
            translation


isSingular : Int -> Bool
isSingular count =
    count == 1


pluralize : Locale -> Pluralize
pluralize locale count singular plural =
    let
        translated =
            if isSingular count then
                translate locale singular

            else
                translate locale plural
    in
    String.fromInt count ++ " " ++ translated


interpolate : String -> String -> String
interpolate string arg =
    case fromString "\\{\\d\\}" of
        Nothing ->
            string

        Just regex ->
            replace regex (\_ -> arg) string


distance_of_time_in_words : Locale -> DistanceOfTime
distance_of_time_in_words locale from_time to_time =
    let
        distance =
            toFloat (Time.posixToMillis to_time - Time.posixToMillis from_time)

        distance_in_minutes =
            round (distance / 1000 / 60)

        distance_in_hours =
            round (distance / 1000 / 3600)

        distance_in_days =
            round (distance / 1000 / 3600 / 24)

        distance_in_months =
            round (distance / 1000 / 3600 / 24 / 30)

        transform count what =
            let
                key =
                    if isSingular count then
                        "Helpers {0} " ++ what ++ " ago"

                    else
                        "Helpers {0} " ++ what ++ "s ago"
            in
            interpolate (translate locale key) (String.fromInt count)
    in
    if distance_in_months > 0 then
        transform distance_in_months "month"

    else if distance_in_days > 0 then
        transform distance_in_days "day"

    else if distance_in_hours > 0 then
        transform distance_in_hours "hour"

    else if distance_in_minutes > 0 then
        transform distance_in_minutes "minute"

    else
        translate locale "Helpers Just now"


number_to_human_size : Locale -> NumberToHumanSize
number_to_human_size locale size =
    if size < 10 ^ 3 then
        pluralize locale size "Helpers Byte" "Helpers Bytes"

    else if size < 10 ^ 6 then
        String.fromFloat (toFloat (size // 10 ^ 2) / 10) ++ " " ++ translate locale "Helpers KB"

    else if size < 10 ^ 9 then
        String.fromFloat (toFloat (size // 10 ^ 5) / 10) ++ " " ++ translate locale "Helpers MB"

    else
        String.fromFloat (toFloat (size // 10 ^ 9) / 10) ++ " " ++ translate locale "Helpers GB"

module Helpers exposing (..)

import Dict exposing (Dict)
import String exposing (join, split)
import Time exposing (Time)


type alias Locale =
    Dict String String


type alias Translate =
    String -> String


type alias Pluralize =
    Int -> String -> String -> String


type alias DistanceOfTime =
    Time -> Time -> String


type alias NumberToHumanSize =
    Int -> String


type alias Helpers =
    { t : Translate
    , pluralize : Pluralize
    , distance_of_time_in_words : DistanceOfTime
    , number_to_human_size : NumberToHumanSize
    }


forLocale : Locale -> Helpers
forLocale locale =
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


pluralize : Locale -> Pluralize
pluralize locale count singular plural =
    (toString count)
        ++ " "
        ++ if count == 1 then
            translate locale singular
           else
            translate locale plural


distance_of_time_in_words : Locale -> DistanceOfTime
distance_of_time_in_words locale from_time to_time =
    let
        distance =
            to_time - from_time

        distance_in_minutes =
            round (Time.inMinutes distance)

        distance_in_hours =
            round (Time.inHours distance)

        distance_in_days =
            round (Time.inHours distance / 24)

        distance_in_months =
            round (Time.inHours distance / (24 * 30))

        ago =
            translate locale "Helpers ago"
    in
        if distance_in_months > 0 then
            (pluralize locale distance_in_months "Helpers month" "Helpers months") ++ " " ++ ago
        else if distance_in_days > 0 then
            (pluralize locale distance_in_days "Helpers day" "Helpers days") ++ " " ++ ago
        else if distance_in_hours > 0 then
            (pluralize locale distance_in_hours "Helpers hour" "Helpers hours") ++ " " ++ ago
        else if distance_in_minutes > 0 then
            (pluralize locale distance_in_minutes "Helpers minute" "Helpers minutes") ++ " " ++ ago
        else
            translate locale "Helpers Just now"


number_to_human_size : Locale -> NumberToHumanSize
number_to_human_size locale size =
    if size < 10 ^ 3 then
        pluralize locale size "Helpers Byte" "Helpers Bytes"
    else if size < 10 ^ 6 then
        (toString (toFloat (size // 10 ^ 2) / 10)) ++ " " ++ (translate locale "Helpers KB")
    else if size < 10 ^ 9 then
        (toString (toFloat (size // 10 ^ 5) / 10)) ++ " " ++ (translate locale "Helpers MB")
    else
        (toString (toFloat (size // 10 ^ 9) / 10)) ++ " " ++ (translate locale "Helpers GB")

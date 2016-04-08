module Helpers (..) where

import Time exposing (Time)


pluralize : Int -> String -> String -> String
pluralize count singular plural =
  (toString count)
    ++ " "
    ++ if count == 1 then
        singular
       else
        plural


distance_of_time_in_words : Time -> Time -> String
distance_of_time_in_words from_time to_time =
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
  in
    if distance_in_months > 0 then
      (pluralize distance_in_months "month" "months") ++ " ago"
    else if distance_in_days > 0 then
      (pluralize distance_in_days "day" "days") ++ " ago"
    else if distance_in_hours > 0 then
      (pluralize distance_in_hours "hour" "hours") ++ " ago"
    else if distance_in_minutes > 0 then
      (pluralize distance_in_minutes "minute" "minutes") ++ " ago"
    else
      "Just now"


number_to_human_size : number -> String
number_to_human_size size =
  if size < 10 ^ 3 then
    pluralize size "Byte" "Bytes"
  else if size < 10 ^ 6 then
    (toString (toFloat (size // 10 ^ 2) / 10)) ++ " KB"
  else if size < 10 ^ 9 then
    (toString (toFloat (size // 10 ^ 5) / 10)) ++ " MB"
  else
    (toString (toFloat (size // 10 ^ 9) / 10)) ++ " GB"

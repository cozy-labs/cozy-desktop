module Models (..) where


type Step
  = WelcomeStep
  | AddressStep


type alias AppModel =
  { step : Step
  }


initialModel : AppModel
initialModel =
  { step = WelcomeStep
  }

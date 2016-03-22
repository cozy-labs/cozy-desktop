module Models (..) where


type Page
  = WelcomePage
  | AddressPage
  | PasswordPage
  | FolderPage
  | MainPage


type Error
  = NoError
  | MissingAddress
  | MissingPassword
  | InvalidCredentials


type alias AppModel =
  { page : Page
  , error : Error
  , address : String
  , password : String
  , folder : String
  }


initialModel : AppModel
initialModel =
  { page = WelcomePage
  , error = NoError
  , address = ""
  , password = ""
  , folder = "/home/users/Documents/Cozy"
  }

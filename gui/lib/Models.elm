module Models (..) where


type Page
  = WelcomePage
  | AddressPage
  | PasswordPage
  | FolderPage
  | MainPage


type alias AppModel =
  { page : Page
  , address : String
  , password : String
  , folder : String
  }


initialModel : AppModel
initialModel =
  { page = WelcomePage
  , address = ""
  , password = ""
  , folder = "/home/users/Documents/Cozy"
  }

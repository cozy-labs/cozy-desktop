# Setting Up a Development Environment

The following commands should work in a Unix shell (Bash or ZSH for example)
and in Windows PowerShell.

## Code organization and technologies

Cozy Desktop is based on [electron](https://electronjs.org/) and the code is mostly written in JavaScript.
To start developing, check the prerequisites and follow the guide below.

## Install requirements

To develop and build the source code, you will need the following:

-   [Git](https://git-scm.com/)
-   [Node.js](https://nodejs.org/)
-   [Yarn](https://yarnpkg.com/)
-   [Docker](https://www.docker.com/)
-   [Cozy Stack in Docker](./requirements.md#set-up-a-cozy-stack)

Consult [./requirements.md](./requirements.md) for help on this topic.

## Get the code

```
git clone git@github.com:cozy-labs/cozy-desktop.git
cd cozy-desktop
```

**Warning**: The path to your local repository should not include any space,
otherwise [installing dependencies will fail](https://github.com/cozy-labs/cozy-desktop/issues/1097).

## Install dependencies

```
yarn install
```

## Build everything

```
yarn build
```

### Transifex (optional)

If you need to update translations, you'll need a Transifex API token at this step (requested automatically if `transifex` is in your $PATH)

- Create an account on http://www.transifex.com
- Join the Cozy team
- Get your API token from the account settings page

## Start development version

```
yarn start
```

N.B.: the address of the development cozy-stack is http://cozy.tools:8080. Don't forget the protocol part when creating the connection in cozy-desktop for the first time or it won't find the server.

## Run tests

See [./test.md]().

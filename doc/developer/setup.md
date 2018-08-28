# Setting Up a Development Environment

The following commands should work in a Unix shell (Bash or ZSH for example)
and in Windows PowerShell.

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

## Run tests

See [./test.md]().

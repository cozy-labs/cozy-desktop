# Requirements

## Build

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/)
- [Yarn](https://yarnpkg.com/)

## Development

- [Cozy Stack in Docker](#set-up-a-cozy-stack)

### Windows

If you don't own a Windows license but you still need to build / test the app
on Windows, you can use the
[free virtual machines](https://developer.microsoft.com/en-us/microsoft-edge/tools/vms/)
provided by Microsoft, either in [VirtualBox](https://www.virtualbox.org/) or
any of the hypervisors supporting the available VM file formats.

**The following assumes you run commands from an administrator command prompt**

To get an administrator prompt, look for _Command Prompt_ in the start menu,
right-click on it and select _Run as administrator_.

FIXME: Document scoop instead of choco (it works far better).

Once you are in a running Windows session, you can eventually install
[Chocolatey](https://chocolatey.org/) from an administrator prompt, then use
it to install the requirements above (or you can download and install each of
the installers):

    choco install git
    choco install nodejs-lts
    choco install yarn

Right now the _nodejs-lts_ package seems to be broken, you may need to install
the latest Node 6.x by hand.

You may also need at some point to restart the _Command Prompt_, the whole
system, or refresh your environment variables using the`refreshenv` command.

Then install the Windows build tools from an admin console as documented in the
[Microsoft's Node.js guidelines](https://github.com/Microsoft/nodejs-guidelines/blob/master/windows-environment.md#environment-setup-and-configuration):

    npm install -g windows-build-tools

You may still need to manually add the python installation directory to your
`PATH`.
To do so, search for _PATH_ from the start menu and select
_Edit environment variables for your account_.
Then edit the `PATH` user variable (not the system one) and append the
following to the end (assuming `...` is the current text):

    `...;%USERPROFILE%\.windows-build-tools\python27`

To set up Docker, in case you hardware is old or you don't own a Windows Pro
license, you may encounter the same issue as on old macOS hardware (see below).
_(please feel free to improve this section)_

### macOS

You need a Mac to build / test for macOS.

The easiest way to set up the environment is to install and use
[Homebrew](https://brew.sh/):

    brew install git
    brew install node@8
    brew install yarn

To install Docker, first check that your mac has kernel hypervisor support:

    sysctl -n kern.hv_support

If the output is `1`, then you can install the latest Docker version:

    brew cask install docker

Otherwise you'll have to install a Docker VM and set up your shell environment
so the various docker commands know how to use it (you can omit the `default`
parameters below):

    brew cask install docker-toolbox
    docker-machine create default
    eval $(docker-machine env default)

### Fedora 28

    sudo wget https://dl.yarnpkg.com/rpm/yarn.repo -O /etc/yum.repos.d/yarn.repo
    sudo dnf install docker gcc-c++ git nodejs yarn transifex-client python3-pip
    sudo pip install docker-compose
    sudo groupadd docker
    sudo usermod -aG docker $USER # Restart your session so this takes effect

### Ubuntu

    curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
    echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
    sudo add-apt-repository \
     "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
    sudo apt update
    sudo apt install git nodejs build-essential gcc transifex-client icnsutils graphicsmagick python3-pip docker-ce yarn
    sudo pip install docker-compose
    sudo groupadd docker
    sudo usermod -aG docker $USER # Restart your session so this takes effect

## Set up a Cozy stack

If you don't already have a [running Cozy stack](https://github.com/cozy/cozy-stack/blob/master/docs/INSTALL.md), the easiest way to get started is to use [Docker](https://www.docker.com/) & `docker-compose`:

    docker-compose up
    yarn bootstrap

## Cozy Stack

You can run any command in the `cozy-stack` docker container with the
`yarn docker:exec` script, e.g.:

```
yarn docker:exec apt-get update
yarn docker:exec apt-get install git  # So we can install cozy apps
```

You can also run any cozy-stack command with the `yarn cozy-stack` script, e.g.:

```
yarn cozy-stack apps install --domain cozy.tools:8080 drive 'git://github.com/cozy/cozy-drive.git#build-drive'
```

## Complete your setup

See [./setup.md](./setup.md)

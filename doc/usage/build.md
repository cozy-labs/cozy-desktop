# Build Cozy Drive for the GNU/Linux Desktop

## Install some dependencies

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/)
- [Yarn](https://yarnpkg.com/)

## Get the source code from github

```
git clone git@github.com:cozy-labs/cozy-desktop.git
cd cozy-desktop
```

## Install NPM dependencies

```
yarn install
```


**NB:** to speed things up electron will attempt to download a compiled binary. If you are strict about compiling everything on your computer, refer to [the electron build instructions]( https://github.com/electron/electron/blob/master/docs/development/build-instructions-linux.md#build-instructions-linux)

## Build all assets

```
yarn build
```

## Package it into a binary
```
yarn dist
```

## Run it
```bash
mkdir /opt/cozydrive # you can change this path
cp ./dist/CozyDrive-*.AppImage /opts/cozydrive/CozyDrive.AppImage
chmod +x /opt/cozydrive/CozyDrive.AppImage
/opt/cozydrive/CozyDrive.AppImage
```

**Note:** When a new version gets out, the application will attempt to update itself but it will fail, simply repeat the steps above to make it works again.

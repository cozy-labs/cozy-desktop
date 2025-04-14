# Build Twake Desktop for GNU/Linux

**If your distribution is supported, it is much  easier to use our provided `.AppImage` file**

## Install some dependencies

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/)
- [Yarn](https://yarnpkg.com/)

## Get the source code from github

```
git clone git@github.com:cozy-labs/cozy-desktop.git
cd cozy-desktop
```

## Install dependencies

```
yarn install:all
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


## Contribute

We want to support as much linux distribution as possible, but we just don't have the resource.

As of this writing, the biggest limiter is a bug where the AppImage does not build unless the `GLIBCXX >= 3.4.21`

We did an exploration to fix this issue but do not have the time to experiment and implement any ot the potential solutions.

If you have experience with compiling/packaging for linux, you can help us with a PR to setup build for your distribution's package or by implementing one of the following option to make the `.AppImage` works with older glibc versions.

**Option A: convince the whole chain electron-builder > prebuild > node-gyp to build against another libc version**

- Prebuild has a --libc options, not sure what value it takes, not sure which compilers it needs.

**Option B: bundling `libstdc++.so`**
- Add `libstdc++.so` to AppImage build : https://github.com/electron-userland/electron-builder/issues/1985
- But AppImage does not recommend it, as it might break on newer distro https://github.com/AppImage/AppImageKit/wiki/Creating-AppImages#libstdcso6
- So AppImage recommends to use https://github.com/darealshinji/AppImageKit-checkrt/ to only include the bundled `.so` if the distro is too old.
- But we need to figure out how to include this within `electron-builder`
- This adds a few Mo to the build, but insignificant compare to the whole bundle.

**Option C: Building on an older distro should give us a working binary.**
But we will need to duplicate the works done on https://github.com/electron-userland/electron-builder/tree/master/docker to get a working build environment. And until we try, we have no guarantee it will even works.

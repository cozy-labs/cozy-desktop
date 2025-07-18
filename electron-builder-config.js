const macOSArch = process.arch

const config = {
  appId: 'io.cozy.desktop',
  files: [
    'core/**',
    'gui/app.css',
    'gui/elm.js',
    'gui/fonts',
    'gui/images',
    'gui/index.html',
    'gui/js',
    'gui/utils',
    'gui/locales',
    'gui/main.js',
    'gui/node_modules',
    'gui/notes/**',
    'gui/ports.js',
    'gui/scripts/**',
    'package.json',
    'gui/details.html',
    'gui/details.js',
    'gui/markdown-viewer.html',
    'gui/markdown-viewer.js',
    'node_modules/cozy-ui/dist/*.css'
  ],
  forceCodeSigning: true,
  afterPack: './build/afterPackHook.js',
  afterSign: './build/afterSignHook.js',
  asarUnpack: [
    'gui/scripts/**',
    '**/*.node' // see https://www.electronjs.org/docs/tutorial/application-packaging#adding-unpacked-files-to-asar-archives
  ],
  directories: {
    buildResources: 'gui/assets'
  },
  fileAssociations: {
    ext: 'cozy-note',
    name: 'Cozy Note',
    description: 'Cozy Note markdown export',
    mimeType: 'text/vnd.cozy.note+markdown',
    role: 'Viewer'
  },

  mac: {
    hardenedRuntime: true,
    entitlements: './build/entitlements.mac.inherit.plist',
    category: 'public.app-category.productivity',
    target: [
      {
        target: 'zip', // this is required for the update to work (see https://github.com/electron-userland/electron-builder/issues/2199)
        arch: [macOSArch]
      },
      { target: 'dmg', arch: [macOSArch] }
    ],
    notarize: false // XXX: we do it ourselves in afterSign
  },
  dmg: {
    contents: [
      { x: 110, y: 150 },
      { x: 440, y: 150, type: 'link', path: '/Applications' }
    ]
  },

  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    // Comment out the following line if the Digicert server starts failing.
    // Electron-Builder will then swtich back to the default Comodoca server.
    rfc3161TimeStampServer: 'http://timestamp.digicert.com',
    sign: 'build/windows/customSign.js',
    signDlls: true,
    signingHashAlgorithms: ['sha256']
  },

  linux: {
    target: [{ target: 'AppImage', arch: ['x64'] }],
    category: 'Network;FileTransfer;',
    desktop: {
      StartupNotify: 'true'
    },
    synopsis:
      'Twake Desktop is a synchronization tool for your Twake Workplace files and folders.',
    description:
      'Save them safely in your open source personal cloud, access them anywhere, anytime with the mobile application and share them with the world or just your friends and colleagues. You can host your own Twake Workplace or use hosted services. Your freedom to chose is why you can trust us.'
  },
  appImage: {
    artifactName: 'Twake-Desktop-${arch}.${ext}',
    executableArgs: [' '] // do not use --no-sandbox by default (see build/launcher-script.sh for details on when it should be used)
  },

  extraResources: [
    { from: 'build/launcher-script.sh', to: 'launcher-script.sh' },
    { from: 'node_modules/regedit/vbs', to: 'regedit/vbs', filter: ['**/*'] },
    {
      from: 'build/vnd.cozy.note+markdown.xml',
      to: 'vnd.cozy.note+markdown.xml'
    },
    { from: 'build/text-x-cozy-note.svg', to: 'text-x-cozy-note.svg' }
  ]
}

module.exports = config

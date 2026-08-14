module.exports = {
  appId: 'com.musicapp',
  productName: 'Music',
  directories: {
    buildResources: 'public',
    output: 'dist/build',
  },
  files: [
    'dist/electron-main.js',
    'dist/electron-preload.js',
    'node_modules/**/*',
    'public/**/*',
    'package.json',
  ],
  win: {
    target: ['nsis', 'portable'],
    certificateFile: process.env.WIN_CERTIFICATE_FILE,
    certificatePassword: process.env.WIN_CERTIFICATE_PASSWORD,
    signingHashAlgorithms: ['sha256'],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
  },
  mac: {
    target: ['dmg', 'zip'],
    identity: process.env.MAC_IDENTITY,
  },
  linux: {
    target: ['AppImage', 'deb'],
  },
};

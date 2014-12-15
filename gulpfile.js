require('coffee-script/register'); // for mocha

var gulp = require('gulp');
var coffee = require('gulp-coffee');
var coffeelint = require('gulp-coffeelint');
var shell = require('gulp-shell');
var insert = require('gulp-insert');
var del = require('del');
var mocha = require('gulp-mocha');
var should = require('should');

var nwVersion = '0.8.6';
var paths = {
  scripts: ['backend/*.coffee'],
  scriptsJS: ['./cli.js', 'backend/*.js'],
  bin: ['cli.js'],
  tests: ['tests/functional.coffee'],
  all: ["backend/**/*.js", "client/public/**", "app.html", "package.json",
        "node_modules/**"],
  leveldown: 'node_modules/pouchdb/node_modules/leveldown'
};


gulp.task('clean', function(cb) {
  del(paths.scriptsJS, cb);
});


gulp.task('scripts', ['clean'], function() {
  gulp.src(paths.scripts)
    .pipe(coffee({bare: true}))
    .pipe(gulp.dest('backend'));
});


gulp.task('bin-scripts', function() {
  gulp.src("cli.coffee")
    .pipe(coffee({bare: true}))
    .pipe(gulp.dest('./'));
});


gulp.task('set-bin-hashbang', function() {
  setTimeout(function () {
    gulp.src(paths.bin)
      .pipe(insert.prepend('#!/usr/bin/env node\n'))
      .pipe(gulp.dest('./'));
  }, 1000);
});


gulp.task('build-package',
          ['clean', 'scripts', 'bin-scripts', 'set-bin-hashbang']);


gulp.task('leveldown', shell.task([
  'cd ' + paths.leveldown + ' && nw-gyp configure --target=' + nwVersion,
  'cd ' + paths.leveldown + ' && nw-gyp build'
]));


gulp.task('leveldown-classic', shell.task([
  'rm -rf ./node_modules/pouchdb',
  'npm install --production'
]));

gulp.task('build-gui-package', ['scripts', 'leveldown'], function() {
  var NwBuilder = require('node-webkit-builder');
  var nw = new NwBuilder({
      files: paths.all,
      version: nwVersion,
      macIcns: 'packaging/nw.icns',
      platforms: ['linux64', 'linux32', 'osx']
  });
  nw.build().then(function () {
     console.log('Cozy Data Proxy was successfully built.');
  }).catch(function (error) {
     console.log('An error occured whild building Cozy Data Proxy.');
     console.log(error);
  });
});


gulp.task('make-deb-32', shell.task([
  'rm -rf pkg_tree',
  'mkdir -p pkg_tree/opt/cozy-desktop pkg_tree/usr/share/doc/cozy-desktop pkg_tree/usr/share/applications',
  'install -b -o root -g root -m 0755 build/cozy-desktop/linux32/* pkg_tree/opt/cozy-desktop/',
  'install -b -o root -g root -m 0644 packaging/icon.png pkg_tree/usr/share/doc/cozy-desktop/',
  'install -b -o root -g root -m 0644 packaging/cozy-desktop.desktop pkg_tree/usr/share/applications/',
  '/bin/sh packaging/create_deb i386'
]));


gulp.task('make-deb-64', shell.task([
  'rm -rf pkg_tree',
  'mkdir -p pkg_tree/opt/cozy-desktop pkg_tree/usr/share/doc/cozy-desktop pkg_tree/usr/share/applications',
  'install -b -o root -g root -m 0755 build/cozy-desktop/linux64/* pkg_tree/opt/cozy-desktop/',
  'install -b -o root -g root -m 0644 packaging/icon.png pkg_tree/usr/share/doc/cozy-desktop/',
  'install -b -o root -g root -m 0644 packaging/cozy-desktop.desktop pkg_tree/usr/share/applications/',
  '/bin/sh packaging/create_deb amd64'
]));


gulp.task('make-rpm-32', shell.task([
  'rm -rf pkg_tree',
  'mkdir -p pkg_tree/opt/cozy-desktop pkg_tree/usr/share/doc/cozy-desktop pkg_tree/usr/share/applications',
  'install -b -o root -g root -m 0755 build/cozy-desktop/linux32/* pkg_tree/opt/cozy-desktop/',
  'install -b -o root -g root -m 0644 packaging/icon.png pkg_tree/usr/share/doc/cozy-desktop/',
  'install -b -o root -g root -m 0644 packaging/cozy-desktop.desktop pkg_tree/usr/share/applications/',
  '/bin/sh packaging/create_rpm i386'
]));


gulp.task('make-rpm-64', shell.task([
  'rm -rf pkg_tree',
  'mkdir -p pkg_tree/opt/cozy-desktop pkg_tree/usr/share/doc/cozy-desktop pkg_tree/usr/share/applications',
  'install -b -o root -g root -m 0755 build/cozy-desktop/linux64/* pkg_tree/opt/cozy-desktop/',
  'install -b -o root -g root -m 0644 packaging/icon.png pkg_tree/usr/share/doc/cozy-desktop/',
  'install -b -o root -g root -m 0644 packaging/cozy-desktop.desktop pkg_tree/usr/share/applications/',
  '/bin/sh packaging/create_rpm amd64'
]));


gulp.task('make-osx-app', shell.task([
  'cp -a build/cozy-desktop/osx/cozy-desktop.app .'
]));

gulp.task('coffeelint', function() {
  gulp.src(paths.scripts)
    .pipe(coffeelint())
    .pipe(coffeelint.reporter())
});


gulp.task('test', function() {
  gulp.src(paths.tests, {
    read: false
  }).pipe(mocha({
    reporter: 'spec',
    globals: {should: require('should')}
  }));
});


gulp.task('watch', function() {
  gulp.watch(paths.scripts, ['scripts']);
});


gulp.task('default',  ['watch']);

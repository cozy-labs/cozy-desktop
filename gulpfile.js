require('coffee-script/register'); // for mocha

var gulp = require('gulp');
var coffee = require('gulp-coffee');
var coffeelint = require('gulp-coffeelint');
var shell = require('gulp-shell');
var del = require('del');
var mocha = require('gulp-mocha');
var should = require('should');

var nwVersion = '0.8.6';
var paths = {
  scripts: ['backend/*.coffee'],
  scriptsJS: ['backend/*.js'],
  tests: ['tests/*.coffee'],
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

   gulp.src("cli.coffee")
    .pipe(coffee({bare: true}))
    .pipe(gulp.dest('./'));
});

gulp.task('watch', function() {
  gulp.watch(paths.scripts, ['scripts']);
});

gulp.task('leveldown', shell.task([
  'cd ' + paths.leveldown + ' && nw-gyp configure --target=' + nwVersion,
  'cd ' + paths.leveldown + ' && nw-gyp build'
]));

gulp.task('leveldown-classic', shell.task([
  'rm -rf ./node_modules/pouchdb',
  'npm install'
]));

gulp.task('builder', ['scripts', 'leveldown'], function() {
  var NwBuilder = require('node-webkit-builder');
  var nw = new NwBuilder({
      files: paths.all,
      version: nwVersion,
      platforms: ['linux64']
  });
  nw.build().then(function () {
     console.log('Cozy Data Proxy was successfully built.');
  }).catch(function (error) {
     console.log('An error occured whild building Cozy Data Proxy.');
     console.log(error);
  });
});

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


gulp.task('default',  ['watch']);

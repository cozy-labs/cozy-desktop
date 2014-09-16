var gulp = require('gulp');
var coffee = require('gulp-coffee');
var concat = require('gulp-concat');
var stylus = require('gulp-stylus');
var del = require('del');
//var uglify = require('gulp-uglify');
//var sourcemaps = require('gulp-sourcemaps');

var paths = {
  assets: ['app/assets/*', 'app/assets/**/*'],
  scripts: ['app/**/*.coffee', 'app/*.coffee'],
  stylesheets: ['app/styles/*.styl'],
  vendors: ['vendor/scripts/*.js'],
  vendorStylesheets: ['vendor/stylesheets/*.css'],
};

gulp.task('clean', function(cb) {
  del(['public'], cb);
});


gulp.task('assets', [], function() {
  return gulp.src(paths.assets)
    .pipe(gulp.dest('public/'));
});

gulp.task('scripts', ['assets'], function() {
  return gulp.src(paths.scripts)
    .pipe(coffee({bare: true}))
    .pipe(gulp.dest('public/javascripts'));
});

gulp.task('stylesheets', ['scripts'], function() {
  return gulp.src(paths.stylesheets)
    .pipe(stylus())
    .pipe(concat('app.css'))
    .pipe(gulp.dest('public/stylesheets'));
});

gulp.task('vendors', ['stylesheets'], function() {
  return gulp.src(paths.vendors)
    .pipe(concat('vendor.js'))
    .pipe(gulp.dest('public/javascripts/'));
});

gulp.task('vendorStylesheets', ['vendors'], function() {
  return gulp.src(paths.vendorStylesheets)
    .pipe(concat('vendor.css'))
    .pipe(gulp.dest('public/stylesheets/'));
});

gulp.task('watch', function() {
    gulp.watch('app/*.coffee', ['scripts']);
    gulp.watch('app/*.css', ['stylesheets']);
});

gulp.task('default',  [
  'vendorStylesheets']);

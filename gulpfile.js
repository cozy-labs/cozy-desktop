var gulp = require('gulp');
var coffee = require('gulp-coffee');
var del = require('del');

var paths = {
  scripts: ['backend/*.coffee'],
  scriptsJS: ['backend/*.js']
};

gulp.task('clean', function(cb) {
  del(paths.scriptsJS, cb);
});

gulp.task('scripts', ['clean'], function() {
  return gulp.src(paths.scripts)
    .pipe(coffee({bare: true}))
    .pipe(gulp.dest('backend'));
});

gulp.task('watch', function() {
    gulp.watch(paths.scripts, ['scripts']);
});

gulp.task('default',  ['watch']);

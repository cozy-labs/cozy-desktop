// See: https://github.com/MarshallOfSound/Google-Play-Music-Desktop-Player-UNOFFICIAL-/blob/1b2055b286f1f296c0d48dec714224c14acb3c34/test/istanbul-reporter.js

const istanbulAPI = require('istanbul-api');
const libCoverage = require('istanbul-lib-coverage');

function Istanbul(runner) {
  runner.on('end', () => {
    const mainReporter = istanbulAPI.createReporter();
    const coverageMap = libCoverage.createCoverageMap();

    coverageMap.merge(global.__coverage__ || {});

    mainReporter.addAll(['text', 'html']);
    mainReporter.write(coverageMap, {});
  });
}


module.exports = Istanbul;

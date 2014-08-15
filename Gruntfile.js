// To use this file in WebStorm, right click on the file name in the Project Panel (normally left) and select "Open Grunt Console"

/** @namespace __dirname */
/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

module.exports = function (grunt) {

    var srcDir    = __dirname + "/";
    var pkg       = grunt.file.readJSON('package.json');
    var iopackage = grunt.file.readJSON('io-package.json');

    // Project configuration.
    grunt.initConfig({
        pkg: pkg,
        // Javascript code styler
        jscs: require('./tasks/jscs.js'),
        // Lint
        jshint: require('./tasks/jshint.js')
    });

    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-jscs');

    grunt.registerTask('default', [
        'jshint',
        'jscs'
    ]);
};
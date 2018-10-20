const semver = require('semver');
const chalk = require('chalk');
const config = require('../package');


exports.check = () => {
  if (!semver.satisfies(process.version, config.engine.node)) {
    console.log(chalk.red(
      '  You must upgrade node to >=' + config.engine.node + '.x to use vue-cli'
    ))
    return false;
  }
  return true;
}
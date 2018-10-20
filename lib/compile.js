const Metalsmith = require('metalsmith');
const handle = require('handlebars');
const render = require('consolidate').handlebars.render;
const { prompt } = require('inquirer');
const logger = require('./logger');
const fs = require('fs');
const minimatch = require('minimatch');
const async = require('async');
const ora = require('ora');

class Compile {
  constructor(name, to, tmp) {
    this.ops = {};
    this.ops.name = name;
    this.ops.to = to;
    this.ops.tmp = tmp;
    this.ops.prompt = [];
  }

  async init() {
    this._getMeta();
    this._getGit();
    this._setValue('project_name', this.ops.name);
    // this._setValue('author', this.ops.author);
    await this._metalsmith();
  }

  /**
   * get data from meta.js
   * @private
   */
  _getMeta() {
    if (!fs.existsSync(`${this.ops.tmp}/meta.js`)) throw new Error(`cannot reolve 'meta.js'`);
    const meta = require(`${this.ops.tmp}/meta.js`);
    if (meta !== Object(meta)) throw new Error(`'meta.js' should expose an object`);
    Object.keys(meta).forEach(item => {
      this.ops[item] = meta[item];
    })
  }

  /**
   * get git info
   * @private
   */
  _getGit() {
    const split = function (data) {
      return data.split('=') && data.split('=').length > 1 ? data.split('=')[1] : ''
    }
    const res = require('child_process').execSync(
      'git config --global  --list \n', {encoding: 'utf8'}
    );
    const data = res.split('\n');
    let str = '';
    data.forEach(item => {
      if (item.indexOf('user.name') >= 0) {
        str += split(item);
      } else if (item.indexOf('user.email') >= 0) {
        str += ` <${split(item)}>`
      }
    })
    this.ops.author = str;
  }

  /**
   * set default value to ops.prompt
   * @param key
   * @param value
   * @private
   */
  _setValue(key, value) {
    const pd = this.ops.prompt;
    pd.hasOwnProperty(key) && value
      ? pd[key].default = value
      : pd[key] = {type: 'string', default: value, name: key}
  }

  /**
   * handle template
   * @private
   */
  _metalsmith() {
    const metalsmith = Metalsmith(this.ops.tmp);
    this.ops.metadata = metalsmith.metadata();
    return new Promise((resolve, reject) => {
      metalsmith
        .use(this._questions.bind(this))
        .use(this._filter.bind(this))
        .use(this._renderTem.bind(this))
        .clean(false)
        .source('.')
        .destination(this.ops.to)
        .build(async (err, files, done) => {
          if (err) reject(err);
          let spinner;
          if (this.ops.success && typeof this.ops.success === 'function') {
            console.log();
            spinner = ora('installing packages \n');
            spinner.start();
            await this.ops.success(this.ops.name, this.ops.to,logger);
          }
          spinner.stop();
          resolve();
        })
    })
  }

  /**
   * The answer needed to customize the template
   * @param files
   * @param metalsmith
   * @param done
   * @returns {Promise<void>}
   * @private
   */
  async _questions(files, metalsmith, done) {
    const questions = Object.values(this.ops.prompt);
    const answers = await prompt(questions);
    Object.keys(answers).forEach(item => {
      this.ops.metadata[item] = answers[item];
    })
    done();
  }

  /**
   * Filter related files
   * @param files
   * @param metalsmith
   * @param done
   * @returns {Promise<void>}
   * @private
   */
  async _filter(files, metalsmith, done) {
    if (!this.ops.filters) return done();
    Object.keys(files).forEach(file => {
      Object.keys(this.ops.filters).forEach(filter => {
        const value = this.ops.filters[filter];
        const filterBool = value === true || !this.ops.metadata[value];
        const fileBool = minimatch(file, filter, { dot: true });
        if (filterBool && fileBool) {
          delete files[file];
        }
      })
    })
    done();
  }

  /**
   * 代码
   * @param files
   * @param metalsmith
   * @param done
   * @private
   */
  _renderTem(files, metalsmith, done) {
    // skipsomefiles
    const keys = Object.keys(files);
    async.each(keys, (file, next) => {
      if (this.ops.skips && this.ops.skips.indexOf(file) >= 0) {
        return next()
      }
      const str = files[file].contents.toString();
      if (!/{{([^{}]+)}}/g.test(str)) {
        return next()
      }
      render(str, this.ops.metadata, (err,res) => {
        if (err) {
          err.message = `[${file}] ${err.message}`
          return next(err)
        }
        files[file].contents = new Buffer(res)
        next()
      })
    }, done)
  }
}


module.exports = exports = Compile;
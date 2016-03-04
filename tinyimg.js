#!/usr/bin/env node

var fs = require('fs');
var request = require('request');
var path = require('path');
var minimatch = require('minimatch');
var glob = require('glob');
var uniq = require('array-uniq');
var chalk = require('chalk');
var pretty = require('prettysize');
var mkdirp = require('mkdirp');
var rmdir = require('rmdir');

var argv = require('minimist')(process.argv.slice(2));
var home = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
var version = require('./package.json').version;
var key = '';

const PLUGIN_NAME = 'tinyimg';
const TEMP_DIR = '.tinyimg/';

var cleanTemp = function() {
    rmdir(TEMP_DIR, function(err, dirs, files) {
        mkdirp(TEMP_DIR, function(err) {
            if (err) { console.error('创建缓存目录失败，请确保命令有操作权限'); }
        });
    });
};

var download = function(uri, filename, complete) {
    request.head(uri, function(err, res, body) {
        request({ url: uri, strictSSL: false })
            .pipe(fs.createWriteStream(TEMP_DIR + filename))
            .on('close', function() {
                complete();
            });
    });
};

var tinypng = function(file, cb) {
    fs.createReadStream(file).pipe(request.post('https://api.tinify.com/shrink', {
        auth: {
            'user': 'api',
            'pass': key
        }
    }, function (error, response, body) {
        var filename;
        if (!error) {
            filename = path.basename(file);
            try {
                body = JSON.parse(body);
            } catch (e) {
                console.log(chalk.red('\u2718 请求服务器失败 `' + file + '`'));
            }

            if (response !== undefined) {
                if (response.statusCode === 201) {

                    if (body.output.size < body.input.size) {

                        console.log(chalk.green('\u2714 成功为`' + file + '`节省了 ' + chalk.bold(pretty(body.input.size - body.output.size) + ' (' + Math.round(100 - 100 / body.input.size * body.output.size) + '%)') + ' '));

                        download(body.output.url, filename, function() {
                            fs.readFile(TEMP_DIR + filename, function(err, data) {
                                if (err) {
                                    console.log('[error] :  ' + PLUGIN_NAME + ' - ', err);
                                } else {
                                    cb(data);
                                }
                            });
                        });

                    } else {
                        console.log(chalk.yellow('\u2718 `' + file + '` 不能再压缩了'));
                        cb();
                    }
                } else {

                    if (body.error === 'TooManyRequests') {
                        console.log(chalk.red('\u2718 `' + file + '` API超出每个月使用次数，可以换个KEY继续使用'));
                        cb();
                    } else if (body.error === 'Unauthorized') {
                        console.log(chalk.red('\u2718 `' + file + '` 授权非法'));
                        cb();
                    } else {
                        console.log(chalk.red('\u2718 `' + file + '` ' + body.message));
                        cb();
                    }

                }
            } else {
                console.log(chalk.red('\u2718 `' + file + '` 服务器未响应'));
                cb();
            }
        }
    }));
};

if (argv.v || argv.version) {

    console.log("当前安装的版本为: v" + version);

} else if (argv.h || argv.help) {

    console.log(
        '使用方法:\n' +
        '  tinyimg <path>\n' +
        '\n' +
        '示例:\n' +
        '  tinyimg .\n' +
        '  tinyimg assets/img\n' +
        '  tinyimg assets/img/test.png\n' +
        '  tinyimg assets/img/test.jpg\n' +
        '\n' +
        '参数列表:\n' +
        '  -k, --key         设置API KEY\n' +
        '  -r, --recursive   递归子目录\n' +
        '  -v, --version     显示当前安装的版本号\n' +
        '  -h, --help        显示帮助列表'
    );

} else {

    console.log(chalk.underline.bold('Tinyimg tool(v' + version + ')\n'));

    var files = argv._.length ? argv._ : ['.'];

    if (argv.k || argv.key) {
        key = typeof(argv.k || argv.key) === 'string' ? (argv.k || argv.key).trim() : '';
    } else if (fs.existsSync(home + '/.tinyimg')) {
        key = fs.readFileSync(home + '/.tinyimg', 'utf8').trim();
    }

    if (key.length === 0) {
        console.log(chalk.bold.red('没有设置API KEY, KEY可以从官网申请获得，官网地址:' + chalk.underline('https://tinypng.com/developers') + '.'));
    } else {

        var images = [];
        files.forEach(function(file) {
            if (fs.existsSync(file)) {
                if (fs.lstatSync(file).isDirectory()) {
                    images = images.concat(glob.sync(file + (argv.r || argv.recursive ? '/**' : '') + '/*.+(png|jpg|jpeg)'));
                } else if (minimatch(file, '*.+(png|jpg|jpeg)', {
                        matchBase: true
                    })) {
                    images.push(file);
                }
            }
        });

        var unique = uniq(images);

        if (unique.length === 0) {
            console.log(chalk.bold.red('\u2718 没有找到JPG或PNG图片.'));
        } else {
            console.log(chalk.bold.green('\u2714 共找到 ' + unique.length + ' 张图片\n'));
            console.log(chalk.bold.magenta('=== 任务开始 ===\n'));

            unique.forEach(function(file, index) {
                tinypng(file, function(data) {
                    if(typeof data != "undefined" && data) {
                        var wstream = fs.createWriteStream(file);
                        wstream.write(data);
                        wstream.end();
                    }
                    if(index == (unique.length - 1)) {
                        cleanTemp();
                        console.log(chalk.bold.magenta('\n=== 任务完成 ==='));
                    }
                }.bind(this));
            });

        }

    }

}

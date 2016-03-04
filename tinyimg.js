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
var ext = require('ext-ext');
var svgo = require('svgo');

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

var fileCallback = function(file, data, islast) {
    var wstream = fs.createWriteStream(file);
    wstream.write(data);
    wstream.end(function() {
        if(islast) {
            console.log(chalk.bold.magenta('\n=== 任务完成 ==='));
            rmdir(TEMP_DIR);
        }
    });
};

/**
 * 压缩JPG和PNG
 * 
 * @param  {[type]} file   [description]
 * @param  {[type]} islast [description]
 * @return {[type]}        [description]
 */
var tinypng = function(file, islast) {
    fs.createReadStream(file).pipe(request.post('https://api.tinify.com/shrink', {
        auth: {
            'user': 'api',
            'pass': key
        }
    }, function (error, response, body) {
        
        if (!error) {
            
            try {
                body = JSON.parse(body);
            } catch (e) {
                console.log(chalk.red('\u2718 请求服务器失败 `' + file + '`'));
            }

            if (response !== undefined) {
                if (response.statusCode === 201) {

                    if (body.output.size < body.input.size) {

                        download(body.output.url, filename, function() {
                            fs.readFile(TEMP_DIR + filename, function(err, data) {
                                if (err) {
                                    console.log('[error] :  ' + PLUGIN_NAME + ' - ', err);
                                } else {
                                    console.log(chalk.green('\u2714 成功为`' + file + '`节省了 ' + chalk.bold(pretty(body.input.size - body.output.size) + ' (' + Math.round(100 - 100 / body.input.size * body.output.size) + '%)') + ' '));
                                    fileCallback(file, data, islast);
                                }
                            });
                        });

                    } else {
                        console.log(chalk.yellow('\u2718 `' + file + '` 不能再压缩了'));
                    }
                } else {

                    if (body.error === 'TooManyRequests') {
                        console.log(chalk.red('\u2718 `' + file + '` API超出每个月使用次数，可以换个KEY继续使用'));
                    } else if (body.error === 'Unauthorized') {
                        console.log(chalk.red('\u2718 `' + file + '` 授权非法'));
                    } else {
                        console.log(chalk.red('\u2718 `' + file + '` ' + body.message));
                    }

                }
            } else {
                console.log(chalk.red('\u2718 `' + file + '` 服务器未响应'));
            }
        }
    }));
};

/**
 * 压缩svg
 * @param  {[type]} file   [description]
 * @param  {[type]} islast [description]
 * @return {[type]}        [description]
 */
var svgmin = function(file, islast) {
    var svgomin = new svgo();
    fs.readFile(file, 'utf8', function(err, data) {
        if (err) {
            throw err;
        }
        svgomin.optimize(data, function(result) {
            console.log(chalk.green('\u2714 成功为`' + file + '`节省了 ' + chalk.bold(pretty(data.length  - result.data.length) + ' (' + Math.round(100 - 100 / data.length * result.data.length) + '%)') + ' '));
            fileCallback(file, result.data, islast);
        });
    });
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
        cleanTemp();

        var images = [];
        files.forEach(function(file) {
            if (fs.existsSync(file)) {
                if (fs.lstatSync(file).isDirectory()) {
                    images = images.concat(glob.sync(file + (argv.r || argv.recursive ? '/**' : '') + '/*.+(png|jpg|jpeg|gif|svg)'));
                } else if (minimatch(file, '*.+(png|jpg|jpeg|gif|svg)', {
                        matchBase: true
                    })) {
                    images.push(file);
                }
            }
        });

        var unique = uniq(images);

        if (unique.length === 0) {
            console.log(chalk.bold.red('\u2718 没有找到图片文件.'));
        } else {
            console.log(chalk.bold.green('\u2714 共找到 ' + unique.length + ' 张图片\n'));
            console.log(chalk.bold.magenta('=== 任务开始 ===\n'));

            unique.forEach(function(file, index) {
                var filetype,filename;
                filename = path.basename(file);
                filetype = ext(filename);
                var islast = (index == (unique.length - 1)) ? 1 : 0;

                switch(filetype) {
                    case ".svg":
                        svgmin(file, islast);
                        break;
                    case ".jpeg":
                    case ".png":
                    case ".jpg":
                        tinypng(file, islast);
                        break;
                    case ".gif":
                        break;
                    default:
                        break;
                }
            });

        }

    }

}

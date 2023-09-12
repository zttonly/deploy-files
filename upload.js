/**
 * @file upload.js
 * @author zttonly <zttonly@163.com>
 */

const md5 = require('md5');
const upload = require('./index');
const fsrUpload = require('./fsr');

/*
 * node使用, 上传
 *
 * 参数说明:
 * disableFsr: 默认启用fsr 默认false
 * host: fsr上传 host
 * receiver: fsr上传 receiver
 * to: fsr上传 to
 * files: 文件对象{[filenam]: [sourceCode]}
 * replace: 替换内容 [{from:'', to:''}]
 *
 * **/

class Upload {
    constructor(opts) {
        const options = {
            host: '',
            receiver: '',
            throttle: 200,
        };
        options.host = opts.host || options.host;
        options.receiver = opts.receiver || options.receiver;
        options.throttle = opts.throttle || options.throttle;
        options.replace = opts.replace || options.replace;
        this.uploadOptions = {
            host: options.host,
            receiver: options.receiver,
            retry: 2,
            aborted: false
        };
        this.options = options;
        this._deployFiles = {};
    }

    run(options, cb) {
        this.uploadOptions.aborted = true;
        const {
            host,
            receiver,
            throttle,
        } = this.options;
        const {
            to,
            files,
        } = options;
        // 过滤掉已经上传成功的文件
        const targetFiles = this.filterFiles(files);
        const uploadTargets = Object.keys(targetFiles).map(filename => {
            return {
                host,
                receiver,
                content: this.getContent(filename, targetFiles[filename]),
                to,
                subpath: filename.replace(/\?.*$/, '')
            };
        });

        // 是否FIS安全部署服务
        const uploadHandler = options.disableFsr ? upload : fsrUpload;
        const startTime = Date.now();
        setTimeout(() => {
            this.uploadOptions.aborted = false;
            uploadHandler(uploadTargets, this.uploadOptions, () => {
                // 对于存在hash的文件，使用 1 作为flag
                // 对于 tpl、html 这种没有 hash 的文件，使用内容的 md5 作为flag
                Object.keys(targetFiles).forEach(filename => {
                    if (targetFiles[filename]) {
                        this._deployFiles[filename] = md5(targetFiles[filename]);
                    }
                });
                if (cb) {
                    return cb();
                }
                console.log('\n');
                console.log('Upload completed in ' + (Date.now() - startTime) + 'ms.');
            });
        }, throttle);
    }
    filterFiles(files) {
        const targetFiles = {};
        // 过滤掉已经上传成功的文件
        Object.keys(files).forEach(filename => {
            if (this._deployFiles[filename] && (  
                this._deployFiles[filename] === md5(files[filename])
            )) {
                return;
            }
            targetFiles[filename] = files[filename];
        });
        return targetFiles;
    }

    getContent(filename, source) {
        const isContainCdn = /\.(css|js|html|tpl)$/.test(filename);
        if (isContainCdn) {
            source = source.toString();
            this.options.replace.forEach(re => {
                const reg = typeof re.from === 'string' ? new RegExp(re.from, 'ig') : re.from;
                source = source.replace(reg, re.to);
            });
        }
        return source;
    }
}

class UploadManager {
    constructor(baseOpts) {
        this.inited = false;
        this.verified = false;
        this.waitOpts = [];
        this.uploader = {};
        this.baseOpts = baseOpts;
    }
    upload(extOpts) {
        const up = this.getUploader(extOpts);
        if (!this.verified) {
            this.waitOpts.push(extOpts);
            this.verified = true; 
            return up.run(extOpts, () => {
                this.afterVerify();
            });
        }
        if (!this.inited) {
            this.waitOpts.push(extOpts);
            return;
        }
        up.run(extOpts);
    }
    getUploader(options) {
        if (!this.uploader[options.to]) {
            this.uploader[options.to] = new Upload(this.baseOpts);
        }
        return this.uploader[options.to];
    }
    afterVerify() {
        this.inited = true;
        this.waitOpts.forEach(opt => {
            this.getUploader(opt).run(opt);
        });
    }
}

module.exports = UploadManager;

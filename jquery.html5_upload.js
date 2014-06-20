/*globals jQuery, alert, window, FormData, XMLHttpRequest */
(function ($) {
    'use strict';

    $.fn.html5_upload = function (options) {
        var available_events = ['onStart', 'onStartOne', 'onProgress', 'onFinishOne', 'onFinish', 'onError', 'onAbort'];

        function get_file_name(file) {
            return file.name || file.fileName;
        }

        function get_file_size(file) {
            return file.size || file.fileSize;
        }

        options = $.extend({
            onStart: function (event, total) {
                return true;
            },
            onStartOne: function (event, name, number, total) {
                return true;
            },
            onProgress: function (event, progress, name, number, total) {},
            onFinishOne: function (event, response, name, number, total) {},
            onFinish: function (event, total) {},
            onError: function (event, name, error) {},
            onAbort: function (event, name, info) {},
            onBrowserIncompatible: function () {
                alert('Sorry, but your browser is incompatible with uploading files using HTML5 (at least, with current preferences.\n Please install the latest version of Firefox, Safari or Chrome');
            },
            autostart: true,
            autoclear: true,
            stopOnFirstError: false,
            sendBoundary: false,
            fieldName: 'user_file[]',   // ignore if sendBoundary is false
            extraFields: {},            // extra fields to send with file upload request (HTML5 only)
            method: 'post',
            mimeTypes: false,

            STATUSES: {
                STARTED   : 'Started',
                PROGRESS  : 'Progress',
                LOADED    : 'Loaded',
                FINISHED  : 'Finished',
                ABORTED   : 'Aborted',
                FAILED    : 'Failed'
            },

            headers: {
                'Cache-Control': 'no-cache',
                'X-Requested-With': 'XMLHttpRequest',
                'X-File-Name': function (file) {
                    return encodeURIComponent(get_file_name(file));
                },
                'X-File-Size': function (file) { 
                    return get_file_size(file);
                },
                'X-CSRF-Token': $('meta[name="csrf-token"]').attr('content'),
                'Content-Type': function (file) {
                    if (!options.sendBoundary) {
                        return 'multipart/form-data';
                    }
                    return false;
                }
            },

            setName: function (text) {},
            setStatus: function (text) {},
            setProgress: function (value) {},

            genName: function (file, number, total) {
                return this.get_file_name(file) + ' [' + Math.ceil(this.get_file_size(file) / 1E3) + 'Kb] (' + (number + 1) + ' of ' + total + ')';
            },
            genStatus: function (progress, finished) {
                if (finished) {
                    if (progress === 1) {
                        return options.STATUSES.FINISHED;
                    } else if (progress === -1) {
                        return options.STATUSES.ABORTED;
                    } else {
                        return options.STATUSES.FAILED;
                    }
                }
                if (progress === 0) {
                    return options.STATUSES.STARTED;
                } else if (progress === 1) {
                    return options.STATUSES.LOADED;
                } else {
                    return options.STATUSES.PROGRESS;
                }
            },
            genProgress: function (loaded, total) {
                return loaded / total;
            }
        }, options, {
            // a bit nasty, but add these two cross-platform API functions to the resulting options object, 
            // which is passed as `this` to options.url() and others
            get_file_name: get_file_name,
            get_file_size: get_file_size
        });

        function upload( files ) {
            var total = files.length;
            var $this = $(this);
            var uploaded, xhr; 
            
            if (!$this.triggerHandler('html5_upload.onStart', [total])) {
                return false;
            }

            this.disabled = true;
            this.html5_upload.continue_after_abort = true;
            
            uploaded = 0;
            xhr = this.html5_upload.xhr;
            
            function upload_file(number) {
                if (number === total) {
                    $this.triggerHandler('html5_upload.onFinish', [total]);
                    $this.attr('disabled', false);

                    if (options.autoclear) {
                        $this.val('');
                    }
                    return;
                }
                
                var file = files[number];
                if (!$this.triggerHandler('html5_upload.onStartOne', [get_file_name(file), number, total])) {
                    // user code decided to skip this one, which to us equals 'aborted single transfer':
                    options.setStatus(options.genStatus(-1, true));
                    return upload_file(number + 1);
                }

                options.setStatus(options.genStatus(0));
                options.setName(options.genName(file, number, total));
                options.setProgress(options.genProgress(0, get_file_size(file)));

                if (options.mimeTypes && options.mimeTypes.indexOf(file.type) === -1) {
                    $this.triggerHandler('html5_upload.onAbort', [get_file_name(file), {
                        message: "File type not accepted.",
                        mimetype: file.type,
                        file: file 
                    }]);
                    options.setStatus(options.genStatus(-1, true));
                    if (!options.stopOnFirstError) {
                        upload_file(number + 1);
                    }
                    return;
                }

                xhr.upload.onprogress = function (rpe) {
                    $this.triggerHandler('html5_upload.onProgress', [rpe.loaded / rpe.total, get_file_name(file), number, total]);
                    options.setStatus(options.genStatus(rpe.loaded / rpe.total));
                    options.setProgress(options.genProgress(rpe.loaded, rpe.total));
                };

                xhr.onload = function (load) {
                    var status = parseInt(xhr.status, 10);
                    // Accept HTTP status codes 200..204 as success
                    if (status < 200 || status > 204) {
                        $this.triggerHandler('html5_upload.onError', [get_file_name(file), load]);
                        options.setStatus(options.genStatus(0, true));
                        if (!options.stopOnFirstError) {
                            upload_file(number + 1);
                        }
                    } else {
                        $this.triggerHandler('html5_upload.onFinishOne', [xhr.responseText, get_file_name(file), number, total]);
                        options.setStatus(options.genStatus(1, true));
                        options.setProgress(options.genProgress(get_file_size(file), get_file_size(file)));
                        upload_file(number + 1);
                    }
                };

                xhr.onabort = function () {
                    $this.triggerHandler('html5_upload.onAbort', [get_file_name(file), {
                        message: 'Transfer aborted',
                        file: file
                    }]);
                    options.setStatus(options.genStatus(-1, true));
                    if ($this[0].html5_upload.continue_after_abort) {
                        upload_file(number + 1);
                    } else {
                        $this.attr('disabled', false);
                        if (options.autoclear) {
                            $this.val('');
                        }
                    }
                };

                xhr.onerror = function (e) {
                    $this.triggerHandler('html5_upload.onError', [get_file_name(file), e]);
                    options.setStatus(options.genStatus(0, true));
                    if (!options.stopOnFirstError) {
                        upload_file(number + 1);
                    }
                };

                xhr.open(options.method, (typeof options.url === 'function' ? options.url(number, file, files) : options.url), true);
                $.each(options.headers,function (key, val) {
                    val = (typeof val === 'function' ? val(file) : val); // resolve value
                    // if resolved value is boolean false, do not send this header
                    if (val === false) { 
                        return true; 
                    }
                    xhr.setRequestHeader(key, val);
                });

                if (!options.sendBoundary) {
                    xhr.send(file);
                } else {
                    if (window.FormData) {//Many thanks to scottt.tw
                        var f = new FormData();
                        f.append(typeof options.fieldName === 'function' ? options.fieldName() : options.fieldName, file);
                        options.extraFields = (typeof options.extraFields === 'function' ? options.extraFields() : options.extraFields);
                        $.each(options.extraFields, function (key, val){
                            f.append(key, val);
                        });
                        xhr.send(f);
                    } else if (file.getAsBinary) { //Thanks to jm.schelcher
                        var boundary = '------multipartformboundary' + (new Date).getTime();
                        var dashdash = '--';
                        var crlf     = '\r\n';

                        /* Build RFC2388 string. */
                        var builder = '';

                        builder += dashdash;
                        builder += boundary;
                        builder += crlf;

                        builder += 'Content-Disposition: form-data; name="' + (typeof options.fieldName === 'function' ? options.fieldName() : options.fieldName) + '"';

                        //thanks to oyejo...@gmail.com for this fix
                        /**
                         * unescape is deprecated. Replaced with decodeURI
                         * (http://developer.mozilla.org/en/JavaScript/Reference/Deprecated_and_obsolete_features)
                         */
                        fileName = decodeURI(encodeURIComponent(get_file_name(file))); // encode_utf8

                        builder += '; filename="' + fileName + '"';
                        builder += crlf;

                        builder += 'Content-Type: ' + file.type;
                        builder += crlf;
                        builder += crlf;

                        /* Append binary data. */
                        builder += file.getAsBinary();
                        builder += crlf;

                        /* Write boundary. */
                        builder += dashdash;
                        builder += boundary;
                        builder += dashdash;
                        builder += crlf;

                        xhr.setRequestHeader('content-type', 'multipart/form-data; boundary=' + boundary);
                        xhr.sendAsBinary(builder);
                    } else {
                        options.onBrowserIncompatible();
                    }
                }
            }
            upload_file(0);
            return true;
        }

        try {
            return this.each(function () {
                var file_input = this;
                this.html5_upload = {
                    xhr:                  new XMLHttpRequest(),
                    continue_after_abort: true
                };
                if (options.autostart) {
                    $(this).on('change', function (e) {
                        upload.call( e.target, this.files );
                    });
                }
                for (var event in available_events) {
                    if (available_events.hasOwnProperty(event)) {
                        if (options[available_events[event]]) {
                            $(this).on('html5_upload.' + available_events[event], options[available_events[event]]);
                        }
                    }
                }
                $(this)
                    .on('html5_upload.startFromDrop', function (e, dropEvent) {
                        if (dropEvent.dataTransfer && dropEvent.dataTransfer.files.length) {
                            upload.call(file_input, dropEvent.dataTransfer.files);    
                        }
                    })
                .on('html5_upload.start', upload)
                .on('html5_upload.cancelOne', function () {
                        this.html5_upload.xhr.abort();
                    })
                .on('html5_upload.cancelAll', function () {
                        this.html5_upload.continue_after_abort = false;
                        this.html5_upload.xhr.abort();
                    })
                .on('html5_upload.destroy', function () {
                        this.html5_upload.continue_after_abort = false;
                        this.xhr.abort();
                        delete this.html5_upload;
                    $(this).off('html5_upload.*').off('change', upload);
                    });
            });
        }
        catch (ex) {
            options.onBrowserIncompatible();
            return false;
        }
    };
}(jQuery));


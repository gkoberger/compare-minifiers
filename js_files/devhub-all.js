$.fn.truncate = function(opts) {
    opts = opts || {};
    if (z.hasTruncation && (!opts.dir || opts.dir != 'v')) return this;
    var showTitle = opts.showTitle || false,
        dir = (opts.dir && opts.dir[0]) || 'h',
        scrollProp = dir == "h" ? "scrollWidth" : "scrollHeight",
        offsetProp = dir == "h" ? "offsetWidth" : "offsetHeight",
        truncText = opts.truncText || "&hellip;",
        textEl = opts.textEl || false,
        split = [" ",""], counter, success;
    this.each(function() {
        var $el = $(this),
            $tel = textEl ? $(textEl, $el) : $el,
            txt, cutoff,
            oldtext = $tel.attr("oldtext") || $tel.text();
        $tel.attr("oldtext", oldtext);
        for (var i in split) {
            delim = split[i];
            txt = oldtext.split(delim);
            cutoff = txt.length;
            success = false;
            if ($tel.attr("oldtext")) {
                $tel.text(oldtext);
            }
            if ((this[scrollProp] - this[offsetProp]) < 2) {
                $el.removeClass("truncated");
                break;
            }
            var chunk = Math.ceil(txt.length/2), oc=0, wid, delim;
            for (counter = 0; counter < 15; counter++) {
                $tel.html(escape_(txt.slice(0,cutoff).join(delim)) + truncText);
                wid = (this[scrollProp] - this[offsetProp]);
                if (cutoff < 1) {
                    break;
                } else if (wid < 2 && chunk == oc) {
                    if (dir == 'h' || (delim == '' && this["scrollWidth"] < this["offsetWidth"])) {
                        success = true;
                        $el.addClass("truncated");
                        break;
                    }
                } else if (wid > 1) {
                    cutoff -= chunk;
                } else {
                    cutoff += chunk;
                }
                oc = chunk;
                chunk = Math.ceil(chunk/2);
            }
            if (success) break;
        }
        if (showTitle && oldtext != $tel.text()) {
            $tel.attr("title", oldtext);
        }
    });
    return this;
};
$.fn.untruncate = function() {
    this.each(function() {
        var $el = $(this),
            oTxt = $el.attr("oldtext");
        if (oTxt) {
            $el.text(oTxt);
        }
    });
    return this;
};
/* This abstracts the uploading of all files.  Currently, it's only
 * extended by addonUploader().  Eventually imageUploader() should as well */

(function( $ ){
    var instance_id = 0,
    boundary = "BoUnDaRyStRiNg";

    function getErrors(results) {
        return results.errors;
    }

    var settings = {'filetypes': [], 'getErrors': getErrors, 'cancel': $()};

    $.fn.fileUploader = function( options ) {

        return $(this).each(function(){
            var $upload_field = $(this),
                formData = false,
                $form = $upload_field.closest('form'),
                errors = false,
                aborted = false;

            if (options) {
                $.extend( settings, options );
            }

            $upload_field.bind({"change": uploaderStart});

            $(settings['cancel']).click(_pd(function(){
                $upload_field.trigger('upload_action_abort');
            }));

            function uploaderStart(e) {
                if($upload_field[0].files.length == 0) {
                    return;
                }

                var domfile = $upload_field[0].files[0],
                    url = $upload_field.attr('data-upload-url'),
                    csrf = $("input[name=csrfmiddlewaretoken]").val(),
                    file = {'name': domfile.name || domfile.fileName,
                            'size': domfile.size,
                            'type': domfile.type};

                formData = new z.FormData();
                aborted = false;

                $upload_field.trigger("upload_start", [file]);

                /* Disable uploading while something is uploading */
                $upload_field.attr('disabled', true);
                $upload_field.parent().find('a').addClass("disabled");
                $upload_field.bind("reenable_uploader", function(e) {
                    $upload_field.attr('disabled', false);
                    $upload_field.parent().find('a').removeClass("disabled");
                });

                var exts = new RegExp("\\\.("+settings['filetypes'].join('|')+")$", "i");

                if(!file.name.match(exts)) {
                    errors = [gettext("The filetype you uploaded isn't recognized.")];

                    $upload_field.trigger("upload_errors", [file, errors]);
                    $upload_field.trigger("upload_finished", [file]);

                    return;
                }

                // We should be good to go!
                formData.open("POST", url, true);
                formData.append("csrfmiddlewaretoken", csrf);
                if(options.appendFormData) {
                    options.appendFormData(formData);
                }

                if(domfile instanceof File) { // Needed b/c of tests.
                  formData.append("upload", domfile);
                }

                $upload_field.unbind("upload_action_abort").bind("upload_action_abort", function() {
                    aborted = true;
                    formData.xhr.abort();
                    errors = [gettext("You cancelled the upload.")];
                    $upload_field.trigger("upload_errors", [file, errors]);
                    $upload_field.trigger("upload_finished", [file]);
                });

                formData.xhr.upload.addEventListener("progress", function(e) {
                    if (e.lengthComputable) {
                        var pct = Math.round((e.loaded * 100) / e.total);
                        $upload_field.trigger("upload_progress", [file, pct]);
                    }
                }, false);

                formData.xhr.onreadystatechange = function(e){
                    $upload_field.trigger("upload_onreadystatechange",
                                          [file, formData.xhr, aborted]);
                };

                formData.send();
            }
        });

    }
})( jQuery );

/*
 * addonUploader()
 * Extends fileUploader()
 * Also, this can only be used once per page.  Or you'll have lots of issues with closures and scope :)
 */

(function( $ ){
    /* Normalize results */
    function getErrors(results) {
      var errors = [];

      if(results.validation.messages) {
          $.each(results.validation.messages, function(i, v){
            if(v.type == "error") {
              errors.push(v.message);
            }
          });
      }
      return errors;
    }

    $.fn.addonUploader = function( options ) {
        var settings = {'filetypes': ['xpi', 'jar', 'xml'], 'getErrors': getErrors, 'cancel': $()};

        if (options) {
            $.extend( settings, options );
        }

        function parseErrorsFromJson(response) {
            var json, errors = [];
            try {
                json = JSON.parse(response);
            } catch(err) {
                errors = [gettext("There was a problem contacting the server.")];
            }
            if (!errors.length) {
                errors = settings['getErrors'](json);
            }
            return {
                errors: errors,
                json: json
            }
        }

        return $(this).each(function(){
            var $upload_field = $(this),
                file = {};

            /* Add some UI */

            var ui_parent = $('<div>', {'class': 'invisible-upload prominent cta', 'id': 'upload-file-widget'}),
                ui_link = $('<a>', {'class': 'button prominent', 'href': '#', 'text': gettext('Select a file...')}),
                ui_details = $('<div>', {'class': 'upload-details', 'text': gettext('Your add-on should end with .xpi, .jar or .xml')});

            $upload_field.attr('disabled', false);
            $upload_field.wrap(ui_parent);
            $upload_field.before(ui_link);
            $upload_field.parent().after(ui_details);

            /* Get things started */

            var upload_box, upload_title, upload_progress_outside, upload_progress_inside,
                upload_status, upload_results, upload_status_percent, upload_status_progress,
                upload_status_cancel;

            $upload_field.fileUploader(settings);

            function textSize(bytes) {
                // Based on code by Cary Dunn (http://bit.ly/d8qbWc).
                var s = ['bytes', 'kb', 'MB', 'GB', 'TB', 'PB'];
                if(bytes === 0) return bytes + " " + s[1];
                var e = Math.floor( Math.log(bytes) / Math.log(1024) );
                return (bytes / Math.pow(1024, Math.floor(e))).toFixed(2)+" "+s[e];
            }

            function updateStatus(percentage, size) {
                if (percentage) {
                    upload_status.show();
                    p = Math.round(percentage);
                    size = (p / 100) * size;

                    // L10n: {0} is the percent of the file that has been uploaded.
                    upload_status_percent.text(format(gettext('{0}% complete'), [p]));

                    // L10n: "{bytes uploaded} of {total filesize}".
                    upload_status_progress.text(format(gettext('{0} of {1}'),
                                [textSize(size), textSize(file.size)]));
                }
            }

            /* Bind the events */

            $upload_field.bind("upload_start", function(e, _file){
                file = _file;

                /* Remove old upload box */
                if(upload_box) {
                    upload_box.remove();
                }

                /* Remove old errors */
                $upload_field.closest('form').find('.errorlist').remove();

                /* Don't allow submitting */
                $('.addon-upload-dependant').attr('disabled', true);

                /* Create elements */
                upload_title = $('<strong>', {'id': 'upload-status-text'});
                upload_progress_outside = $('<div>', {'id': 'upload-status-bar'});
                upload_progress_inside = $('<div>').css('width', 0);
                upload_status = $('<div>', {'id': 'uploadstatus'}).hide();
                upload_status_percent = $('<span>');
                upload_status_progress = $('<span>');
                upload_status_cancel_a = $('<a>', {'href': '#', 'text': gettext('Cancel')});
                upload_status_cancel = $('<span> &middot; </span>');
                upload_results = $('<div>', {'id': 'upload-status-results'});
                upload_box = $("<div>", {'class': 'upload-status ajax-loading'}).hide();

                /* Set up structure */
                upload_box.append(upload_title);
                upload_progress_outside.append(upload_progress_inside);
                upload_box.append(upload_progress_outside);
                upload_status.append(upload_status_percent);
                upload_status.append(" <span> &middot; </span> ");
                upload_status.append(upload_status_progress);
                upload_status.append(upload_status_cancel);
                upload_status_cancel.append(upload_status_cancel_a);

                upload_box.append(upload_status);
                upload_box.append(upload_results);

                /* Add to the dom and clean up upload_field */
                ui_details.after(upload_box);

                /* It's showtime! */
                upload_title.html(format(gettext('Uploading {0}'), [escape_(file.name)]));
                upload_box.show();

                upload_box.addClass("ajax-loading");

                upload_status_cancel_a.click(_pd(function(){
                    $upload_field.trigger("upload_action_abort");
                }));
            });

            $upload_field.bind("upload_progress", function(e, file, pct) {
                upload_progress_inside.animate({'width': pct + '%'},
                    {duration: 300, step:function(i){ updateStatus(i, file.size); } });
            });

            $upload_field.bind("upload_errors", function(e, file, errors, results){
                var all_errors = $.extend([], errors);  // be nice to other handlers
                upload_progress_inside.stop().css({'width': '100%'});

                $upload_field.val("").attr('disabled', false);
                $upload_field.trigger("reenable_uploader");

                upload_title.html(format(gettext('Error with {0}'), [escape_(file.name)]));

                upload_progress_outside.attr('class', 'bar-fail');
                upload_progress_inside.fadeOut();

                var error_message = format(ngettext(
                        "Your add-on failed validation with {0} error.",
                        "Your add-on failed validation with {0} errors.",
                        all_errors.length), [all_errors.length]);

                $("<strong>").text(error_message).appendTo(upload_results);

                var errors_ul = $('<ul>', {'id': 'upload_errors'});

                $.each(all_errors.splice(0, 5), function(i, error) {
                    errors_ul.append($("<li>", {'html': error }));
                });

                if(all_errors.length > 0) {
                    var message = format(ngettext('&hellip;and {0} more',
                                                  '&hellip;and {0} more',
                                                  all_errors.length), [all_errors.length]);
                    errors_ul.append($('<li>', {'html': message}));
                }

                upload_results.append(errors_ul).addClass('status-fail');

                if (results && results.full_report_url) {
                    // There might not be a link to the full report
                    // if we get an early error like unsupported type.
                    upload_results.append($("<a>", {'href': results.full_report_url,
                                                    'class': 'view-more',
                                                    'target': '_blank',
                                                    'text': gettext('See full validation report')}));
                }


            });

            $upload_field.bind("upload_finished", function(e, file, results) {
                upload_box.removeClass("ajax-loading");
                upload_status_cancel.remove();
            });

            $upload_field.bind("upload_success", function(e, file, results) {
                upload_title.html(format(gettext('Validating {0}'), [escape_(file.name)]));

                var animateArgs = {duration: 300, step:function(i){ updateStatus(i, file.size); }, complete: function() {
                    $upload_field.trigger("upload_success_results", [file, results]);
                }};

                upload_progress_inside.animate({'width': '100%'}, animateArgs);
            });

            $upload_field.bind("upload_onreadystatechange", function(e, file, xhr, aborted) {
                var errors = [],
                    $form = $upload_field.closest('form'),
                    json = {},
                    errOb;
                if (xhr.readyState == 4 && xhr.responseText &&
                        (xhr.status == 200 ||
                         xhr.status == 304 ||
                         xhr.status == 400)) {

                    errOb = parseErrorsFromJson(xhr.responseText);
                    errors = errOb.errors;
                    json = errOb.json;

                    if(errors.length > 0) {
                        $upload_field.trigger("upload_errors", [file, errors, json]);
                    } else {
                        $form.find('input#id_upload').val(json.upload);
                        $upload_field.trigger("upload_success", [file, json]);
                        $upload_field.trigger("upload_progress", [file, 100]);
                    }
                    $upload_field.trigger("upload_finished", [file]);

                } else if(xhr.readyState == 4 && !aborted) {
                    // L10n: first argument is an HTTP status code
                    errors = [format(gettext("Received an empty response from the server; status: {0}"),
                                     [xhr.status])];

                    $upload_field.trigger("upload_errors", [file, errors]);
                }
            });


            $upload_field.bind("upload_success_results", function(e, file, results) {
                if(results.error) {
                    // This shouldn't happen.  But it might.
                    var error = gettext('Unexpected server error while validating.');
                    $upload_field.trigger("upload_errors", [file, [error]]);
                    return;
                }

                // Validation results?  If not, fetch the json again.
                if(! results.validation) {
                    upload_progress_outside.attr('class', 'progress-idle');
                    // Not loaded yet. Try again!
                    setTimeout(function(){
                        $.ajax({
                            url: results.url,
                            dataType: 'json',
                            success: function(r) {
                                $upload_field.trigger("upload_success_results", [file, r]);
                            },
                            error: function(xhr, textStatus, errorThrown) {
                                var errOb = parseErrorsFromJson(xhr.responseText);
                                $upload_field.trigger("upload_errors", [file, errOb.errors, errOb.json]);
                                $upload_field.trigger("upload_finished", [file]);
                            }
                        });
                    }, 1000);
                } else {
                    var errors = getErrors(results),
                        v = results.validation;
                    if(errors.length > 0) {
                        $upload_field.trigger("upload_errors", [file, errors, results]);
                        return;
                    }

                    $upload_field.val("").attr('disabled', false);

                    /* Allow submitting */
                    $('.addon-upload-dependant').attr('disabled', false);

                    upload_title.html(format(gettext('Finished validating {0}'), [escape_(file.name)]));

                    var message = "";

                    var warnings = v.warnings + v.notices;
                    if(warnings > 0) {
                        message = format(ngettext(
                                    "Your add-on passed validation with no errors and {0} warning.",
                                    "Your add-on passed validation with no errors and {0} warnings.",
                                    warnings), [warnings]);
                    } else {
                        message = gettext("Your add-on passed validation with no errors or warnings.");
                    }

                    upload_progress_outside.attr('class', 'bar-success');
                    upload_progress_inside.fadeOut();

                    $upload_field.trigger("reenable_uploader");

                    upload_results.addClass("status-pass");

                    $("<strong>").text(message).appendTo(upload_results);

                    if (results.full_report_url) {
                        // There might not be a link to the full report
                        // if we get an early error like unsupported type.
                        upload_results.append($("<a>", {'href': results.full_report_url,
                                                        'target': '_blank',
                                                        'text': gettext('See full validation report')}));
                    }

                    $(".platform ul.error").empty();
                    $(".platform ul.errorlist").empty();
                    if (results.validation.detected_type == 'search' ||
                        results.validation.detected_type == 'webapp') {
                        $(".platform").hide();
                    } else {
                        $(".platform:hidden").show();
                        $('.platform label').removeClass('platform-disabled');
                        $('input.platform').attr('disabled', false);
                        if (results.platforms_to_exclude &&
                            results.platforms_to_exclude.length) {
                            // e.g. after uploading a Mobile add-on
                            var excluded = false;
                            $('input.platform').each(function(e) {
                                var $input = $(this);
                                if ($.inArray($input.val(),
                                              results.platforms_to_exclude) !== -1) {
                                    excluded = true;
                                    $('label[for=' + $input.attr('id') + ']').addClass('platform-disabled');
                                    $input.attr('checked', false);
                                    $input.attr('disabled', true);
                                }
                            });
                            $.each(['.desktop-platforms', '.mobile-platforms'], function(i, sel) {
                                var disabled = $(sel + ' input:disabled').length,
                                    all = $(sel + ' input').length;
                                if (disabled > 0 && disabled == all) {
                                    $(sel + ' label').addClass('platform-disabled');
                                }
                            });
                            if (excluded) {
                                var msg = gettext('Some platforms are not available for this type of add-on.');
                                $('.platform').prepend(
                                    format('<ul class="errorlist"><li>{0}</li></ul>',
                                           msg));
                            }
                        }
                    }
                }

            });

        });
    };
})( jQuery );


/* To use this, upload_field must have a parent form that contains a
   csrf token. Additionally, the field must have the attribute
   data-upload-url.  It will upload the files (note: multiple files
   are supported; they are uploaded separately and each event is triggered
   separately), and clear the upload field.

   The data-upload-url must return a JSON object containing an `upload_hash` and
   an `errors` array.  If the error array is empty ([]), the upload is assumed to
   be a success.

   Example:
    No Error: {"upload_hash": "123ABC", "errors": []}
    Error: {"upload_hash": "", "errors": ["Uh oh!"]}

   In the events, the `file` var is a JSON object with the following:
    - name
    - size
    - type: image/jpeg, etc
    - instance: A unique ID for distinguishing between multiple uploads.
    - dataURL: a data url for the image (`false` if it doesn't exist)

   Events:
    - upload_start(e, file): The upload is started
    - upload_success(e, file, upload_hash): The upload was successful
    - upload_errors(e, file, array_of_errors): The upload failed
    - upload_finished(e, file): Called after a success OR failure
    - [todo] upload_progress(e, file, percent): Percentage progress of the file upload.

    - upload_start_all(e): All uploads are starting
    - upload_finished_all(e): All uploads have either succeeded or failed

    [Note: the upload_*_all events are only triggered if there is at least one
    file in the upload box when the "onchange" event is fired.]
 */


(function( $ ){
    var instance_id = 0,
        boundary = "BoUnDaRyStRiNg";

    $.fn.imageUploader = function() {
        var $upload_field = this,
            outstanding_uploads = 0,
            files = $upload_field[0].files,
            url = $upload_field.attr('data-upload-url'),
            csrf = $upload_field.closest('form').find('input[name^=csrf]').val();

        // No files? We do nothing.
        if(files.length === 0) {
            return false;
        }

        $upload_field.trigger("upload_start_all");

        // Loop through the files.
        $.each(files, function(v, f){
            var data = "",
                file = {
                    'instance': instance_id,
                    'name': f.name || f.fileName,
                    'size': f.size,
                    'type': f.type,
                    'aborted': false,
                    'dataURL': false},
                finished = function(){
                    outstanding_uploads--;
                    if(outstanding_uploads <= 0) {
                        $upload_field.trigger("upload_finished_all");
                    }
                    $upload_field.trigger("upload_finished", [file]);
                },
                formData = new z.FormData();

            instance_id++;
            outstanding_uploads++;

            // Make sure it's images only.
            if(file.type != 'image/jpeg' && file.type != 'image/png') {
                var errors = [gettext("Icons must be either PNG or JPG.")];
                $upload_field.trigger("upload_start", [file]);
                $upload_field.trigger("upload_errors", [file, errors]);
                finished();
                return;
            }

            file.dataURL = $upload_field.objectUrl(v);

            // And we're off!
            $upload_field.trigger("upload_start", [file]);

            // Set things up
            formData.open("POST", url, true);
            formData.append("csrfmiddlewaretoken", csrf);
            formData.append("upload_image", f);

            // Monitor progress and report back.
            formData.xhr.onreadystatechange = function(){
                if (formData.xhr.readyState == 4 && formData.xhr.responseText &&
                    (formData.xhr.status == 200 || formData.xhr.status == 304)) {
                    var json = {};
                    try {
                        json = JSON.parse(formData.xhr.responseText);
                    } catch(err) {
                        var error = gettext("There was a problem contacting the server.");
                        $upload_field.trigger("upload_errors", [file, error]);
                        finished();
                        return false;
                    }

                    if(json.errors.length) {
                        $upload_field.trigger("upload_errors", [file, json.errors]);
                    } else {
                        $upload_field.trigger("upload_success", [file, json.upload_hash]);
                    }
                    finished();
                }
            };

            // Actually do the sending.
            formData.send();
        });

        // Clear out images, since we uploaded them.
        $upload_field.val("");
    };
})( jQuery );




$(document).ready(function() {
    // Edit Add-on
    if($("#edit-addon").length){
        initEditAddon();
    }

    //Ownership
    if ($("#author_list").length) {
        initAuthorFields();
        initLicenseFields();
    }

    //Payments
    if ($('.payments').length) {
        initPayments();
    }

    // Edit Versions
    if($('.edit-version').length) {
        initEditVersions();
    }

    // View versions
    if($('#version-list').length) {
        initVersions();
    }

    // Submission process
    if($('.addon-submission-process').length) {
        initLicenseFields();
        initCharCount();
        initSubmit();
    }

    // Validate addon (standalone)
    if($('.validate-addon').length) {
        initSubmit();
    }
    // Add-on Compatibility Check
    if ($('#addon-compat-upload').length) {
        initAddonCompatCheck($('#addon-compat-upload'));
    }

    // Submission > Describe
    if ($("#submit-describe").length) {
        initCatFields();
    }

    // Submission > Media
    if($('#submit-media').length) {
        initUploadIcon();
        initUploadPreview();
    }

    if ($('.perf-tests').length) {
        initPerfTests(window.document);
    }

    // Add-on uploader
    if($('#upload-addon').length) {
        var opt = {'cancel': $('.upload-file-cancel') };
        if($('#addon-compat-upload').length) {
            opt.appendFormData = function(formData) {
                formData.append('app_id',
                                $('#id_application option:selected').val());
                formData.append('version_id',
                                $('#id_app_version option:selected').val());
            };
        }
        $('#upload-addon').addonUploader(opt);
    }

    if ($(".version-upload").length) {
        $modal = $(".add-file-modal").modal(".version-upload", {
            width: '450px',
            hideme: false,
            callback: function() {
                $('.upload-status').remove();
                return true;
            }
        });

        $('.upload-file-cancel').click(_pd($modal.hideMe));
        $('#upload-file').submit(_pd(function(e) {
            $.ajax({
                url: $(this).attr('action'),
                type: 'post',
                data: $(this).serialize(),
                success: function(response) {
                    if (response.url) {
                        window.location = response.url;
                    }
                },
                error: function(xhr) {
                    var errors = $.parseJSON(xhr.responseText);
                    $("#upload-file").find(".errorlist").remove();
                    $("#upload-file").find(".upload-status").before(generateErrorList(errors));
                    $('#upload-file-finish').attr('disabled', false);
                    $modal.setPos();
                }
            });
        }));
        if (window.location.hash === '#version-upload') {
            $modal.render();
        }
    }

    if($('#upload-webapp-url').exists()) {
        $('#upload-webapp-url').bind("keyup change blur", function(e) {
            var $this = $(this),
                $button = $('#validate_app'),
                match = $this.val().match(/http(.*)\/(.*)\.(webapp|json)/);
          if($this.attr('data-input') != $this.val()) {
              $button.attr('disabled', !match);
              $this.attr('data-input', $this.val());
              $('#upload-status-results').remove();
              $('#upload-file button.upload-file-submit').attr('disabled', true);
          }
        })
        .trigger('keyup')
        .bind('upload_finished', function(e, success, r, message) {
            $('#upload-status-results').remove();
            $('#upload-webapp-url').removeClass('loading');

            var $error_box = $('<div>', {'id': 'upload-status-results', 'class':
                                         'status-' + (success ? 'pass' : 'fail')}).show(),
                $eb_messages = $("<ul>", {'id': 'upload_errors'}),
                messages = r.validation.messages;

            $error_box.append($("<strong>", {'text': message}));
            $error_box.append($eb_messages);

            $.each(messages, function(i, m) {
                var li = $('<li>', {'html': m.message});
                $eb_messages.append(li);
            });

            if (r && r.full_report_url) {
                // There might not be a link to the full report
                // if we get an early error like unsupported type.
                $error_box.append($("<a>", {'href': r.full_report_url,
                                            'target': '_blank',
                                            'class': 'view-more',
                                            'text': gettext('See full validation report')}));
            }

            $('.upload-status').append($error_box);
        })
        .bind('upload_errors', function(e, r) {
            var v = r.validation,
                error_message = format(ngettext(
                    "Your app failed validation with {0} error.",
                    "Your app failed validation with {0} errors.",
                    v.errors), [v.errors.length]);

            $(this).trigger('upload_finished', [false, r, error_message]);
            $('#validate_app').attr('disabled', false);
        })
        .bind('upload_success', function(e, r) {
            var message = "",
                v = r.validation,
                warnings = v.warnings + v.notices;

            if(warnings > 0) {
                message = format(ngettext(
                            "Your app passed validation with no errors and {0} message.",
                            "Your app passed validation with no errors and {0} messages.",
                            warnings), [warnings]);
            } else {
                message = gettext("Your app passed validation with no errors or messages.");
            }

            $(this).trigger('upload_finished', [true, r, message]);
            $('#upload-file button.upload-file-submit').attr('disabled', false);
        });

        $('#validate-field').submit(function() {
            if($('#validate_app').attr('disabled')) return false;

            $('#validate_app').attr('disabled', true);
            $.post($('#upload-webapp-url').attr('data-upload-url'), {'manifest': $('#upload-webapp-url').val()}, check_webapp_validation);
            $('#upload-webapp-url').addClass('loading');
            return false;
        });
        function check_webapp_validation(results) {
            var $upload_field = $('#upload-webapp-url');
            $('#id_upload').val(results.upload);
            if(! results.validation) {
                setTimeout(function(){
                    $.ajax({
                        url: results.url,
                        dataType: 'json',
                        success: check_webapp_validation,
                        error: function(xhr, textStatus, errorThrown) {
                            /*
                            var errOb = parseErrorsFromJson(xhr.responseText);
                            $upload_field.trigger("upload_errors", [file, errOb.errors, errOb.json]);
                            $upload_field.trigger("upload_finished", [file]);
                            */
                        }
                    });
                }, 1000);
            } else {
                if(results.validation.errors) {
                    $upload_field.trigger("upload_errors", [results]);
                } else {
                    $upload_field.trigger("upload_success", [results]);
                }
            }
        }
    }

    // Jetpack
    if($('#jetpack').exists()) {
        $('a[rel=video-lightbox]').click(_pd(function() {
            var $this = $(this),
                text = gettext('Your browser does not support the video tag'),
                $overlay = $('<div>', {id: 'jetpack-overlay'}),
                $video = $('<video>', {'controls': 'controls', 'text': text,
                                       'css': {'max-width': $this.attr('data-width') + 'px'}}),
                $src_mp3 = $('<source>', {'type': 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
                                          'src': $this.attr('data-mp4') }),
                $src_webm = $('<source>', {'type': 'video/webm; codecs="vp8, vorbis"',
                                           'src': $this.attr('data-webm') }),
                $src_ogv = $('<source>', {'type': 'video/ogv; codecs="theora, vorbis"',
                                          'src': $this.attr('data-ogv') });

            $(window).bind('keydown.lightboxDismiss', function(e) {
                if (e.which == 27) {
                    $overlay.remove();
                    $(window).unbind('keydown.lightboxDismiss');
                }
            });
            $overlay.append($video);
            $video.append($src_mp3);
            $video.append($src_webm);
            $video.append($src_ogv);
            $('body').append($overlay);
            $video[0].play();
            $video.click(function(e){ e.stopPropagation(); });
            $overlay.click(function() {
                $(this).remove();
                $(window).unbind('keydown.lightboxDismiss');
            });
        }));
    }

    $(".invisible-upload a").click(_pd(function() {}));

    // Choosing platform when submitting an Addon and/or files.
    if ($('input.platform').length) {
        initPlatformChooser();
    }

    // when to start and stop image polling
    if ($('#edit-addon-media').length &&
        $('#edit-addon-media').attr('data-checkurl') !== undefined) {
        imageStatus.start();
    }
    $('#edit-addon-media').bind('click', function() {
        imageStatus.cancel();
    })
});

function initUploadControls() {
    /*
    $('.upload-status').removeClass("hidden").hide();
    $('.upload-status').bind('upload-start', function() {
    }).bind('upload-finish', function() {
        $(this).removeClass("ajax-loading");
    });
    $(".invisible-upload").delegate("#upload-file-input", "change", function(e) {
        $('#upload-status-bar').attr('class', '');
        $('#upload-status-text').text("");
        $('#upload-status-results').text("").attr("class", "");
        $('#upload-status-bar div').css('width', 0).show();
        $('#upload-status-bar').removeClass('progress-idle');
        fileUpload($(this), $(this).closest(".invisible-upload").attr('data-upload-url'));
        $('.upload-status').show();
    });
    */
}

function initPlatformChooser() {
    $('input.platform').live('change', function(e) {
        var form = $(this).parents('form'),
            platform = false,
            parent = form,
            val = $(this).val(),
            container = $(this).parents('div:eq(0)');
        $.each(['desktop-platforms', 'mobile-platforms'], function (i, cls) {
            if (container.hasClass(cls)) {
                parent = container;
                return false;
            }
        });
        if (val == '1' || val == '9') {
            // Platform=ALL or Platform=ALL Mobile
            if ($(this).attr('checked')) {
                // Uncheck all other platforms:
                $(format('input.platform:not([value="{0}"])', val),
                  parent).attr('checked', false);
            }
        } else {
            if ($(this).attr('checked')) {
                // Any other platform was checked so uncheck Platform=ALL
                $('input.platform[value="1"],input.platform[value="9"]',
                  parent).attr('checked', false);
            }
        }
    });
}

$(document).ready(function() {
    $.ajaxSetup({cache: false});

    $('.more-actions-popup').each(function() {
      var el = $(this);
      el.popup(el.closest('li').find('.more-actions'), {
        width: 'inherit',
        offset: {x: 15},
        callback: function(obj) {
            return {pointTo: $(obj.click_target)};
        }
      });
    });

    $('.modal-delete').each(function() {
        var el = $(this);
        el.modal(el.closest('li').find('.delete-addon'), {
            width: 400,
            callback: function(obj) {
                fixPasswordField(this);
                return {pointTo: $(obj.click_target)};
            }
        });
    });

    truncateFields();

    initCompatibility();

    $('.addon-edit-cancel').live('click', function(){
        parent_div = $(this).closest('.edit-addon-section');
        parent_div.load($(this).attr('href'), function() {
            hideSameSizedIcons();
            z.refreshL10n();
        });
        if (parent_div.is('#edit-addon-media')) {
            imageStatus.start();
        }
        return false;
    });
});

(function initFormPerms() {
    z.noEdit = $("body").hasClass("no-edit");
    if (z.noEdit) {
        $primary = $(".primary");
        $els = $primary.find("input, select, textarea, button, a.button");
        $els.attr("disabled", "disabled");
        $primary.find("span.handle, a.remove").hide();
        $(".primary h3 a.button").remove();
        $(document).ready(function() {
            $els.unbind().undelegate();
        });
    }
})();

function truncateFields() {
    // TODO (potch) find a good fix for this later
    // as per Bug 622030...
    return;
    // var els = [
    //         "#addon_description",
    //         "#developer_comments"
    //     ];
    // $(els.join(', ')).each(function(i,el) {
    //     var $el = $(el),
    //         originalHTML = $el.html();
    //     $el.delegate("a.truncate_expand", "click", function(e) {
    //         e.preventDefault();
    //         $el.html(originalHTML).css('max-height','none');
    //     })
    //     .vtruncate({
    //         truncText: format("&hellip; <a href='#' class='truncate_expand'>{0}</a>",[gettext("More")])
    //     });
    // });
}


function addonFormSubmit() {
    parent_div = $(this);

    (function(parent_div){
        // If the baseurl changes (the slug changed) we need to go to the new url.
        var baseurl = function(){
            return parent_div.find('#addon-edit-basic').attr('data-baseurl');
        }
        $('.edit-media-button button').attr('disabled', false);
        $('form', parent_div).submit(function(e){
            e.preventDefault();
            var old_baseurl = baseurl();
            parent_div.find(".item").removeClass("loaded").addClass("loading");
            var scrollBottom = $(document).height() - $(document).scrollTop();

            $.post(parent_div.find('form').attr('action'),
                $(this).serialize(), function(d) {
                    parent_div.html(d).each(addonFormSubmit);
                    if (!parent_div.find(".errorlist").length && old_baseurl && old_baseurl !== baseurl()) {
                        document.location = baseurl();
                    }
                    $(document).scrollTop($(document).height() - scrollBottom);
                    truncateFields();
                    annotateLocalizedErrors(parent_div);
                    if(parent_div.is('#edit-addon-media')) {
                        imageStatus.start();
                        hideSameSizedIcons();
                    }

                    if (!parent_div.find(".errorlist").length) {
                        var e = $(format('<b class="save-badge">{0}</b>',
                                         [gettext('Changes Saved')]))
                                  .appendTo(parent_div.find('h3').first());
                        setTimeout(function(){
                            e.css('opacity', 0);
                            setTimeout(function(){ e.remove(); }, 200);
                        }, 2000);
                    }
                });
        });
        reorderPreviews();
        z.refreshL10n();
    })(parent_div);
}


$("#user-form-template .email-autocomplete")
    .attr("placeholder", gettext("Enter a new author's email address"));

function initEditAddon() {
    if (z.noEdit) return;

    // Load the edit form.
    $('#edit-addon').delegate('h3 a', 'click', function(e){
        e.preventDefault();

        a = e.target;
        parent_div = $(a).closest('.edit-addon-section');

        (function(parent_div, a){
            parent_div.find(".item").addClass("loading");
            parent_div.load($(a).attr('data-editurl'), function(){
                if($('#addon-categories-edit').length) {
                    initCatFields();
                }
                $(this).each(addonFormSubmit);
            });
        })(parent_div, a);

        return false;
    });

    // Init icon javascript.
    hideSameSizedIcons();
    initUploadIcon();
    initUploadPreview();
}

function create_new_preview_field() {
    var forms_count = $('#id_files-TOTAL_FORMS').val(),
        last = $('#file-list .preview').last(),
        last_clone = last.clone();

    $('input, textarea, div', last_clone).each(function(){
        var re = new RegExp(format("-{0}-", [forms_count-1])),
            new_count = "-"+forms_count+"-",
            el = $(this);

        $.each(['id','name','data-name'], function(k,v){
            if(el.attr(v)) {
                el.attr(v, el.attr(v).replace(re, new_count));
            }
        });
    });
    $(last).after(last_clone);
    $('#id_files-TOTAL_FORMS').val(parseInt(forms_count) + 1);

    return last;
}

function renumberPreviews() {
    previews = $("#file-list").children(".preview:visible");
    previews.each(function(i, el) {
        $(this).find(".position input").val(i);
    });
    $(previews).find(".handle").toggle(previews.length > 1);
}

function reorderPreviews() {
    var preview_list = $("#file-list");

    if (preview_list.length) {
        preview_list.sortable({
            items: ".preview:visible",
            handle: ".handle",
            containment: preview_list,
            tolerance: "pointer",
            update: renumberPreviews
        });

        renumberPreviews();
    }
}

function initUploadPreview() {
    var forms = {},
        $f = $('#edit-addon-media, #submit-media');

    function upload_start_all(e) {
        // Remove old errors.
        $('.edit-addon-media-screenshot-error').hide();

        // Don't let users submit a form.
        $('.edit-media-button button').attr('disabled', true);
    }

    function upload_finished_all(e) {
        // They can submit again
        $('.edit-media-button button').attr('disabled', false);
    }

    function upload_start(e, file) {
        form = create_new_preview_field();
        forms['form_' + file.instance] = form;

        $(form).show().find('.preview-thumb').addClass('loading')
               .css('background-image', 'url(' + file.dataURL + ')');
        renumberPreviews();
    }

    function upload_finished(e, file) {
        form = forms['form_' + file.instance];
        form.find('.preview-thumb').removeClass('loading');
        renumberPreviews();
    }

    function upload_success(e, file, upload_hash) {
        form = forms['form_' + file.instance];
        form.find('[name$=upload_hash]').val(upload_hash);
    }

    function upload_errors(e, file, errors) {
        var form = forms['form_' + file.instance],
            $el = $(form),
            error_msg = gettext("There was an error uploading your file."),
            $error_title = $('<strong>').text(error_msg),
            $error_list = $('<ul>');

        $el.addClass('edit-addon-media-screenshot-error');

        $.each(errors, function(i, v){
            $error_list.append('<li>' + v + '</li>');
        });

        $el.find('.preview-thumb').addClass('error-loading');

        $el.find('.edit-previews-text').addClass('error').html("")
                                       .append($error_title)
                                       .append($error_list);
        $el.find(".delete input").attr("checked", "checked");
        renumberPreviews();
    }

    $f.delegate('#screenshot_upload', "upload_finished", upload_finished)
      .delegate('#screenshot_upload', "upload_success", upload_success)
      .delegate('#screenshot_upload', "upload_start", upload_start)
      .delegate('#screenshot_upload', "upload_errors", upload_errors)
      .delegate('#screenshot_upload', "upload_start_all", upload_start_all)
      .delegate('#screenshot_upload', "upload_finished_all", upload_finished_all)
      .delegate('#screenshot_upload', 'change', function(e){
        $(this).imageUploader();
      });

    $("#edit-addon-media, #submit-media").delegate("#file-list .remove", "click", function(e){
        e.preventDefault();
        var row = $(this).closest(".preview");
        row.find(".delete input").attr("checked", "checked");
        row.slideUp(300, renumberPreviews);
    });
}

function initUploadIcon() {
    $('#edit-addon-media, #submit-media').delegate('#icons_default a', 'click', function(e){
        e.preventDefault();

        var $error_list = $('#icon_preview').parent().find(".errorlist"),
            $parent = $(this).closest('li');

        $('input', $parent).attr('checked', true);
        $('#icons_default a.active').removeClass('active');
        $(this).addClass('active');

        $("#id_icon_upload").val("");

        $('#icon_preview_32 img').attr('src', $('img', $parent).attr('src'));
        $('#icon_preview_64 img').attr('src', $('img',
                $parent).attr('src').replace(/32/, '64'));

        $error_list.html("");
    });

    // Upload an image!
    var $f = $('#edit-addon-media, #submit-media'),

        upload_errors = function(e, file, errors){
            var $error_list = $('#icon_preview').parent().find(".errorlist");
            $.each(errors, function(i, v){
                $error_list.append("<li>" + v + "</li>");
            });
        },

        upload_success = function(e, file, upload_hash) {
            $('#id_icon_upload_hash').val(upload_hash)
            $('#icons_default a.active').removeClass('active');
            $('#icon_preview img').attr('src', file.dataURL);

            $('#icons_default input:checked').attr('checked', false);
            $('input[name=icon_type][value='+file.type+']', $('#icons_default'))
                    .attr('checked', true);
        },

        upload_start = function(e, file) {
            var $error_list = $('#icon_preview').parent().find(".errorlist");
            $error_list.html("");

            $('.icon_preview img', $f).addClass('loading');

            $('.edit-media-button button').attr('disabled', true);
        },

        upload_finished = function(e) {
            $('.icon_preview img', $f).removeClass('loading');
            $('.edit-media-button button').attr('disabled', false);
        };

    $f.delegate('#id_icon_upload', "upload_success", upload_success)
      .delegate('#id_icon_upload', "upload_start", upload_start)
      .delegate('#id_icon_upload', "upload_finished", upload_finished)
      .delegate('#id_icon_upload', "upload_errors", upload_errors)
      .delegate('#id_icon_upload', 'change', function(e){
        $(this).imageUploader();
      });
}

function fixPasswordField($context) {
    // This is a hack to prevent password managers from automatically
    // deleting add-ons.  See bug 630126.
    $context.find('input[type=password]').each(function(){
        var $this = $(this);
        if($this.attr('data-name')) {
            $this.attr('name', $this.attr('data-name'));
        }
    });
    return true;
}

function initVersions() {
    $('#modals').hide();
    var versions;
    $.getJSON($('#version-list').attr('data-stats'),
              function(json){ versions = json; });

    $('#modal-delete-version').modal('.version-delete .remove',
        {width: 400,
         callback: function(d){
            /* This sucks because of ngettext. */
            var version = versions[$(d.click_target).attr('data-version')],
                header = $('h3', this),
                files = $('#del-files', this),
                reviews = $('#del-reviews', this);
            header.text(format(header.attr('data-tmpl'), version));
            files.text(format(ngettext('{files} file', '{files} files',
                                       version.files),
                              version));
            reviews.text(format(ngettext('{reviews} review', '{reviews} reviews',
                                         version.reviews),
                                version));
            $('.version_id', this).val(version.id);
            return true;
        }});

    $('#modal-cancel').modal('#cancel-review', {width: 400});
    $('#modal-delete').modal('#delete-addon', {width: 400,
                                callback: function(obj) {
                                    return fixPasswordField(this);
                                }});
    $('#modal-disable').modal('#disable-addon',
        {width: 400,
         callback: function(d){
               $('.version_id', this).val($(d.click_target).attr('data-version'));
                return true;
         }});

    $('#upload-file-finish').click(function() {
        var $button = $(this);
        setTimeout(function() { // Chrome fix
            $button.attr('disabled', true);
        }, 50);
    });

}

function initSubmit() {
    var dl = $('body').attr('data-default-locale');
    var el = format('#trans-name [lang={0}]', dl);
    $(el).attr('id', "id_name");
    $('#submit-describe').delegate(el, 'keyup', slugify)
        .delegate(el, 'blur', slugify)
        .delegate('#edit_slug', 'click', show_slug_edit)
        .delegate('#id_slug', 'change', function() {
            $('#id_slug').attr('data-customized', 1);
            var v = $('#id_slug').val();
            if (!v) {
                $('#id_slug').attr('data-customized', 0);
                slugify();
            }
        });
    $('#id_slug').each(slugify);
    reorderPreviews();
    $('.invisible-upload [disabled]').attr("disabled", false);
    $('.invisible-upload .disabled').removeClass("disabled");
}

function generateErrorList(o) {
    var list = $("<ul class='errorlist'></ul>");
    $.each(o, function(i, v) {
        list.append($(format("<li>{0}</li>", v)));
    });
    return list;
}

function initEditVersions() {
    if (z.noEdit) return;
    // Modal box
    $modal = $(".add-file-modal").modal(".add-file", {
        width: '450px',
        hideme: false,
        callback: function() {
            $('.upload-status').remove();
            return true;
        }
    });

    // Handle uploader events
    /*
    $('.upload-status').bind('upload-success', function(e,json) {
        $("#upload-file-finish").attr("disabled", false);
        $modal.setPos();
        $("#id_upload").val(json.upload);
    }).bind('upload-error', function() {
        $modal.setPos(); // Reposition since the error report has been added.
        $("#upload-file-finish").attr("disabled", true);
    });
    */

    $('.upload-file-cancel').click(_pd($modal.hideMe));

    $("#upload-file-finish").click(function (e) {
        e.preventDefault();
        $tgt = $(this);
        if ($tgt.attr("disabled")) return;
        $.ajax({
            url: $("#upload-file").attr("action"),
            type: 'post',
            data: $("#upload-file").serialize(),
            success: function (resp) {
                $("#file-list tbody").append(resp);
                var new_total = $("#file-list tr").length / 2;
                $("#id_files-TOTAL_FORMS").val(new_total);
                $("#id_files-INITIAL_FORMS").val(new_total);
                $modal.hideMe();
            },
            error: function(xhr) {
                var errors = $.parseJSON(xhr.responseText);
                $("#upload-file").find(".errorlist").remove();
                $("#upload-file").find(".upload-status").before(generateErrorList(errors));
                $modal.setPos();
            }
        });
    });

    $("#file-list").delegate("a.remove", "click", function() {
        var row = $(this).closest("tr");
        $("input:first", row).attr("checked", true);
        row.hide();
        row.next().show();
    });

    $("#file-list").delegate("a.undo", "click", function() {
        var row = $(this).closest("tr").prev();
        $("input:first", row).attr("checked", false);
        row.show();
        row.next().hide();
    });

    $('.show_file_history').click(_pd(function(){
        $(this).closest('p').hide().closest('div').find('.version-comments').fadeIn();
    }));

}

function initPayments() {
    if (z.noEdit) return;
    var previews = [
        "img/zamboni/contributions/passive.png",
        "img/zamboni/contributions/after.png",
        "img/zamboni/contributions/roadblock.png",
    ],
        media_url = $("body").attr("data-media-url"),
        to = false,
        img = $("<img id='contribution-preview'/>");
        moz = $("input[value=moz]");
    img.hide().appendTo($("body"));
    moz.parent().after(
        $("<a class='extra' target='_blank' href='http://www.mozilla.org/foundation/'>"+gettext('Learn more')+"</a>"));
    $(".nag li label").each(function (i,v) {
        var pl = new Image();
        pl.src = media_url + previews[i];
        $(this).after(format(" &nbsp;<a class='extra' href='{0}{1}'>{2}</a>", [media_url, previews[i], gettext('Example')]));
    });
    $(".nag").delegate("a.extra", "mouseover", function(e) {
        var tgt = $(this);
        img.attr("src", tgt.attr("href")).css({
            position: 'absolute',
            'pointer-events': 'none',
            top: tgt.offset().top-350,
            left: ($(document).width()-755)/2
        });
        clearTimeout(to);
        to = setTimeout(function() {
            img.fadeIn(100);
        }, 300);
    }).delegate("a.extra", "mouseout", function(e) {
        clearTimeout(to);
        img.fadeOut(100);
    })
    .delegate("a.extra", "click", function(e) {
        e.preventDefault();
    });
    $("#do-setup").click(_pd(function (e) {
        $("#setup").removeClass("hidden").show();
        $(".intro, .intro-blah").hide();
    }));
    $("#setup-cancel").click(_pd(function (e) {
        $(".intro, .intro-blah").show();
        $("#setup").hide();
    }));
    $("#do-marketplace").click(_pd(function (e) {
        $("#marketplace-confirm").removeClass("hidden").show();
        $(".intro, .intro-blah").hide();
    }));
    $("#marketplace-cancel").click(_pd(function (e) {
        $(".intro, .intro-blah").show();
        $("#marketplace-confirm").hide();
    }));
    $(".recipient").change(function (e) {
        var v = $(this).val();
        $(".paypal").hide(200);
        $(format("#org-{0}", [v])).removeClass("hidden").show(200);
    });
    $("#id_enable_thankyou").change(function (e) {
        if ($(this).attr("checked")) {
            $(".thankyou-note").show().removeClass("hidden");
        } else {
            $(".thankyou-note").hide();
        }
    }).change();
}

function initCatFields(delegate) {
    if (!delegate) {
        delegate = document.body;
    }
    $(delegate).find('.addon-app-cats').each(function() {
        var $parent = $(this).closest("[data-max-categories]"),
            $main = $(this).find(".addon-categories"),
            $misc = $(this).find(".addon-misc-category"),
            maxCats = parseInt($parent.attr("data-max-categories"), 10);
        var checkMainDefault = function() {
            var checkedLength = $("input:checked", $main).length,
                disabled = checkedLength >= maxCats;
            $("input:not(:checked)", $main).attr("disabled", disabled);
            return checkedLength;
        };
        var checkMain = function() {
            var checkedLength = checkMainDefault();
            $("input", $misc).attr("checked", checkedLength <= 0);
        };
        var checkOther = function() {
            $("input", $main).attr("checked", false).attr("disabled", false);
        };
        checkMainDefault();
        $("input", $main).live("change", checkMain);
        $("input", $misc).live("change", checkOther);
    });
}

function initLicenseFields() {
    $("#id_has_eula").change(function (e) {
        if ($(this).attr("checked")) {
            $(".eula").show().removeClass("hidden");
        } else {
            $(".eula").hide();
        }
    });
    $("#id_has_priv").change(function (e) {
        if ($(this).attr("checked")) {
            $(".priv").show().removeClass("hidden");
        } else {
            $(".priv").hide();
        }
    });
    var other_val = $(".license-other").attr("data-val");
    $(".license").click(function (e) {
        if ($(this).val() == other_val) {
            $(".license-other").show().removeClass("hidden");
        } else {
            $(".license-other").hide();
        }
    });
}

function initAuthorFields() {
    // Add the help line after the blank author row.
    $('#author-roles-help').popup('#what-are-roles', {pointTo: $('#what-are-roles') });

    if (z.noEdit) return;

    var request = false,
        timeout = false,
        manager = $("#id_form-TOTAL_FORMS"),
        empty_form = template($("#user-form-template").html().replace(/__prefix__/g, "{0}")),
        author_list = $("#author_list");
    author_list.sortable({
        items: ".author",
        handle: ".handle",
        containment: author_list,
        tolerance: "pointer",
        update: renumberAuthors
    });
    addAuthorRow();

    $(".author .errorlist").each(function() {
        $(this).parent()
            .find(".email-autocomplete")
            .addClass("tooltip")
            .addClass("invalid")
            .addClass("formerror")
            .attr("title", $(this).text());
    });

    $("#author_list").delegate(".email-autocomplete", "keypress", validateUser)
    .delegate(".email-autocomplete", "keyup", validateUser)
    .delegate(".remove", "click", function (e) {
        e.preventDefault();
        var tgt = $(this),
            row = tgt.parents("li");
        if (author_list.children(".author:visible").length > 1) {
            if (row.hasClass("initial")) {
                row.find(".delete input").attr("checked", "checked");
                row.hide();
            } else {
                row.remove();
                manager.val(author_list.children(".author").length);
            }
            renumberAuthors();
        }
    });
    function renumberAuthors() {
        author_list.children(".author").each(function(i, el) {
            $(this).find(".position input").val(i);
        });
        if ($(".author:visible").length > 1) {
            author_list.sortable("enable");
            $(".author .remove").show();
            $(".author .handle").css('visibility','visible');
        } else {
            author_list.sortable("disable");
            $(".author .remove").hide();
            $(".author .handle").css('visibility','hidden');
        }
    }
    function addAuthorRow() {
        var numForms = author_list.children(".author").length;
        author_list.append(empty_form([numForms]))
                   .sortable("refresh");
        author_list.find(".blank .email-autocomplete")
                   .placeholder();
        manager.val(author_list.children(".author").length);
        renumberAuthors();
    }
    function validateUser(e) {
        var tgt = $(this),
            row = tgt.parents("li");
        if (row.hasClass("blank")) {
            tgt.removeClass("placeholder")
               .attr("placeholder", undefined);
            row.removeClass("blank")
               .addClass("author");
            addAuthorRow();
        }
        if (tgt.val().length > 2) {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(function () {
                tgt.addClass("ui-autocomplete-loading")
                   .removeClass("invalid")
                   .removeClass("valid");
                request = $.ajax({
                    url: tgt.attr("data-src"),
                    data: {q: tgt.val()},
                    success: function(data) {
                        tgt.removeClass("ui-autocomplete-loading")
                           .addClass("valid");
                    },
                    error: function() {
                        tgt.removeClass("ui-autocomplete-loading")
                           .addClass("invalid");
                    }
                });
            }, 500);
        }
    }
}


function initCompatibility() {
    $('p.add-app a').live('click', function(e) {
        e.preventDefault();
        var outer = $(this).closest('form');

        $('tr.app-extra', outer).each(function() {
            addAppRow(this);
        });

        $('.new-apps', outer).toggle();

        $('.new-apps ul').delegate('a', 'click', function(e) {
            e.preventDefault();
            var extraAppRow = $('tr.app-extra td[class=' + $(this).attr('class') + ']', outer);
            extraAppRow.parents('tr.app-extra').find('input:checkbox').removeAttr('checked')
                       .closest('tr').removeClass('app-extra');

            $(this).closest('li').remove();

            if (!$('tr.app-extra', outer).length)
                $('p.add-app', outer).hide();
        });
    });

    $('.compat-versions .remove').live('click', function(e) {
        e.preventDefault();
        var appRow = $(this).closest('tr');

        appRow.addClass('app-extra');

        if (!appRow.hasClass('app-extra-orig'))
            appRow.find('input:checkbox').attr('checked', true);

        $('p.add-app:hidden', $(this).closest('form')).show();
        addAppRow(appRow);
    });

    $('.compat-update-modal').modal('a.compat-update', {
        delegate: $('.item-actions'),
        hideme: false,
        emptyme: true,
        callback: compatModalCallback
    });

    $('.compat-error-popup').popup('a.compat-error', {
        delegate: $('.item-actions'),
        emptyme: true,
        width: '450px',
        callback: function(obj) {
            var $popup = this,
                ct = $(obj.click_target),
                error_url = ct.attr('data-errorurl');

            if (ct.hasClass('ajax-loading'))
                return;
            ct.addClass('ajax-loading');
            $popup.load(error_url, function(e) {
                ct.removeClass('ajax-loading');
            });

            $('.compat-update-modal').modal('a.compat-update', {
                delegate: $('.compat-error-popup'),
                hideme: false,
                emptyme: true,
                callback: compatModalCallback
            });

            return {pointTo: $(obj.click_target)};
        }
    });
}

function imagePoller() {
    this.start = function(override, delay) {
        if (override || !this.poll) {
            this.poll = window.setTimeout(this.check, delay || 1000);
        }
    };
    this.stop = function() {
        window.clearTimeout(this.poll);
        this.poll = null;
    };
};

var imageStatus = {
    start: function() {
        this.icon = new imagePoller();
        this.preview = new imagePoller();
        this.icon.check = function() {
            var self = imageStatus,
                node = $('#edit-addon-media');
            $.getJSON(node.attr('data-checkurl'),
                function(json) {
                    if (json !== null && json.icons) {
                        $('#edit-addon-media').find('img').each(function() {
                            $(this).attr('src', self.newurl($(this).attr('src')));
                        });
                        self.icon.stop();
                        self.stopping();
                    } else {
                        self.icon.start(true, 2500);
                        self.polling();
                    }
            });
        };
        this.preview.check = function() {
            var self = imageStatus;
            $('div.preview-thumb').each(function(){
                check_images(this);
            });
            function check_images(el) {
                var $this = $(el);
                if ($this.hasClass('preview-successful')) {
                    return;
                }
                var img = new Image();
                img.onload = function() {
                    $this.removeClass('preview-error preview-unknown').addClass('preview-successful');
                    $this.attr('style', 'background-image:url(' + self.newurl($this.attr('data-url')) + ')');
                    if (!$('div.preview-error').length) {
                        self.preview.stop();
                        self.stopping();
                    }
                };
                img.onerror = function() {
                    setTimeout(function(){ check_images(el) }, 2500);
                    self.polling();
                    $this.attr('style', '').addClass('preview-error');
                    delete img;
                };
                img.src = self.newurl($this.attr('data-url'));
            }
        };
        this.icon.start();
        this.preview.start();
    },
    polling: function() {
        if (this.icon.poll || this.preview.poll) {
            var node = $('#edit-addon-media');
            if (!node.find('b.image-message').length) {
                $(format('<b class="save-badge image-message">{0}</b>',
                  [gettext('Image changes being processed')]))
                  .appendTo(node.find('h3').first());
            }
        }
    },
    newurl: function(orig) {
        var bst = new Date().getTime();
        orig += (orig.indexOf('?') > 1 ? '&' : '?') + bst;
        return orig;
    },
    cancel: function() {
        this.icon.stop();
        this.preview.stop();
        this.stopping();
    },
    stopping: function() {
        if (!this.icon.poll && !this.preview.poll) {
            $('#edit-addon-media').find('b.image-message').remove();
        }
    }
};

function multipartUpload(form, onreadystatechange) {
    var xhr = new XMLHttpRequest(),
        boundary = "BoUnDaRyStRiNg",
        form = $(form),
        serialized = form.serializeArray(),
        submit_items = [],
        output = "";

    xhr.open("POST", form.attr('action'), true)
    xhr.overrideMimeType('text/plain; charset=x-user-defined-binary');
    xhr.setRequestHeader('Content-length', false);
    xhr.setRequestHeader("Content-Type", "multipart/form-data;" +
                                         "boundary=" + boundary);

    $('input[type=file]', form).each(function(){
        var files = $(this)[0].files,
            file_field = $(this);

        $.each(files, function(k, file) {
            var data = file.getAsBinary();

            serialized.push({
                'name': $(file_field).attr('name'),
                'value': data,
                'file_type': file.type,
                'file_name': file.name || file.fileName
            });
        });

    });

    $.each(serialized, function(k, v){
        output += "--" + boundary + "\r\n";
        output += "Content-Disposition: form-data; name=\"" + v.name + "\";";

        if(v.file_name != undefined) {
            output += " filename=\"new-upload\";\r\n";
            output += "Content-Type: " + v.file_type;
        }

        output += "\r\n\r\n";
        output += v.value;
        output += "\r\n";

    });

    output += "--" + boundary + "--";

    if(onreadystatechange) {
        xhr.onreadystatechange = function(e){ onreadystatechange(e, xhr); }
    }

    xhr.sendAsBinary(output);
}

function hideSameSizedIcons() {
    icon_sizes = [];
    $('#icon_preview_readonly img').show().each(function(){
        size = $(this).width() + 'x' + $(this).height();
        if($.inArray(size, icon_sizes) >= 0) {
            $(this).hide();
        }
        icon_sizes.push(size);
    });
}


function addAppRow(obj) {
    var outer = $(obj).closest('form'),
        appClass = $('td.app', obj).attr('class');
    if (!$('.new-apps ul', outer).length)
        $('.new-apps', outer).html('<ul></ul>');
    if ($('.new-apps ul a[class=' + appClass + ']', outer).length)
        return;
    var appLabel = $('td.app', obj).text(),
        appHTML = '<li><a href="#" class="' + appClass + '">' + appLabel + '</a></li>';
    $('.new-apps ul', outer).append(appHTML);
}


function compatModalCallback(obj) {
    var $widget = this,
        ct = $(obj.click_target),
        form_url = ct.attr('data-updateurl');

    if ($widget.hasClass('ajax-loading'))
        return;
    $widget.addClass('ajax-loading');
    $widget.load(form_url, function(e) {
        $widget.removeClass('ajax-loading');
    });

    $('form.compat-versions').live('submit', function(e) {
        e.preventDefault();
        $widget.empty();

        if ($widget.hasClass('ajax-loading'))
            return;
        $widget.addClass('ajax-loading');

        var widgetForm = $(this);
        $.post(widgetForm.attr('action'), widgetForm.serialize(), function(data) {
            $widget.removeClass('ajax-loading');
            if ($(data).find('.errorlist').length) {
                $widget.html(data);
            } else {
                var c = $('.item[data-addonid=' + widgetForm.attr('data-addonid') + '] .item-actions li.compat');
                c.load(c.attr('data-src'));
                $widget.hideMe();
            }
        });
    });

    return {pointTo: ct};
}

function initAddonCompatCheck($doc) {
    var $elem = $('#id_application', $doc),
        $form = $doc.closest('form');

    $elem.change(function(e) {
        var $appVer = $('#id_app_version', $form),
            $sel = $(e.target),
            appId = $('option:selected', $sel).val();

        if (!appId) {
            $('option', $appVer).remove();
            $appVer.append(format('<option value="{0}">{1}</option>',
                                  ['', gettext('Select an application first')]));
            return;
        }
        $.post($sel.attr('data-url'),
               {application_id: appId,
                csrfmiddlewaretoken: $("input[name=csrfmiddlewaretoken]", $form).val()},
            function(d) {
                $('option', $appVer).remove();
                $.each(d.choices, function(i, ch) {
                    $appVer.append(format('<option value="{0}">{1}</option>',
                                          [ch[0], ch[1]]));
                });
            });
    });

    if ($elem.children('option:selected').val() &&
        !$('#id_app_version option:selected', $form).val()) {
        // If an app is selected when page loads and it's not a form post.
        $elem.trigger('change');
    }
}

function initPerfTests(doc) {
    $('.perf-test-listing .start-perf-tests', doc).click(function(ev) {
        var $start = $(ev.target),
            start_url = $start.attr('href'),
            $results = $('.perf-results', $start.closest('ul'));
        ev.preventDefault();
        $results.text(gettext('Starting tests...'));
        $.ajax({type: 'GET',
                url: start_url,
                success: function(data) {
                    // TODO(Kumar) poll for results and display message
                    $results.attr('data-got-response', 1);
                    if (data.success) {
                        $results.text(gettext('Waiting for test results...'));
                    } else {
                        $results.text(gettext('Internal Server Error'));
                    }
                },
                error: function(XMLHttpRequest, textStatus, errorThrown) {
                    $results.attr('data-got-response', 1);
                    $results.text(gettext('Internal Server Error'));
                },
                dataType: 'json'});
    });
}
$(document).ready(function() {

    if ($('.addon-validator-suite').length) {
        initValidator();
    }

});

function initValidator() {

    function inherit(OtherClass, constructor) {
        var NewClass = function() {
            OtherClass.apply(this, arguments);
            if (typeof constructor !== 'undefined') {
                constructor.apply(this, arguments);
            }
        }
        $.extend(NewClass.prototype, OtherClass.prototype);
        return NewClass;
    }

    function emptyFn() {
        return null;
    }

    function ResultsTier($suite, tierId, options) {
        if (typeof options === 'undefined')
            options = {}
        if (typeof options.app === 'undefined')
            options.app = null;
        if (typeof options.testsWereRun === 'undefined')
            options.testsWereRun = true;
        this.$results = $('.results', $suite);
        this.app = options.app;
        this.testsWereRun = options.testsWereRun;
        this.counts = {error: 0, warning: 0};
        this.tierId = tierId;
        this.$suite = $suite;
        this.$dom = $('#suite-results-tier-' + tierId, $suite);
        if (!this.$dom.length) {
            this.$dom = this.createDom();
            this.$results.append(this.$dom);
        }
        this.$tierResults = $('.tier-results', this.$dom);
        this.wakeUp();
    }

    ResultsTier.prototype.tallyMsgType = function(type_) {
        if (type_ == 'notice') type_ = 'warning';
        this.counts[type_] += 1;
    };

    ResultsTier.prototype.createDom = function() {
        var $tier = $($('.template', this.$suite).html());
        $tier.attr('id', 'suite-results-tier-' + this.tierId);
        return $tier;
    }

    ResultsTier.prototype.summarize = function() {
        var sm = resultSummary(this.counts.error, this.counts.warning),
            resultClass, summaryMsg;
        $('.result-summary', this.$dom).css('visibility', 'visible')
                                       .empty().text(sm);
        if (this.counts.error) {
            resultClass = 'tests-failed';
        } else if (this.counts.warning) {
            resultClass = 'tests-passed-warnings';
        } else {
            if (this.testsWereRun) {
                summaryMsg = gettext('All tests passed successfully.');
                resultClass = 'tests-passed';
            } else {
                summaryMsg = gettext('These tests were not run.');
                resultClass = 'tests-notrun';
                // No summary since no tests were run:
                $('.result-summary', this.$dom).html('&nbsp;');
            }
            this.$tierResults.append('<span>' + summaryMsg + '</span>');
        }
        this.$tierResults.removeClass('ajax-loading', 'tests-failed',
                                      'tests-passed', 'tests-passed-warnings',
                                      'tests-notrun')
                         .addClass(resultClass);
        if ($('.test-tier', this.$suite).length)
            this.topSummary();
        return this.counts;
    };

    ResultsTier.prototype.topSummary = function() {
        var $top = $('[class~="test-tier"]' +
                     '[data-tier="' + this.tierId + '"]', this.$suite),
            summaryMsg = resultSummary(this.counts.error, this.counts.warning);

        $('.tier-summary', $top).text(summaryMsg);
        $top.removeClass('ajax-loading', 'tests-failed', 'tests-passed',
                         'tests-notrun');
        if (this.counts.error > 0) {
            $top.addClass('tests-failed');
        } else {
            if (this.testsWereRun)
                $top.addClass('tests-passed');
            else
                $top.addClass('tests-notrun');
        }
    };

    ResultsTier.prototype.wakeUp = function() {
        var $title = $('h4', this.$dom),
            changeLink;
        $('.tier-results', this.$dom).empty();
        this.$dom.removeClass('hidden');
        this.$dom.show();
        if (this.app) {
            // Override the title with a special app/version title
            $title.text(format('{0} {1} {2}',
                               this.app.trans[this.app.guid],
                               this.app.version,
                               gettext('Tests')));
            changeLink = this.app.versionChangeLinks[this.app.guid + ' ' +
                                                     this.app.version];
            if (changeLink) {
                this.$dom.prepend(
                    format('<a class="version-change-link" href="{0}">{1}</a>',
                           changeLink,
                           // L10n: Example: Changes in Firefox 5
                           gettext(format('Changes in {0} {1}',
                                          this.app.trans[this.app.guid],
                                          this.app.version.substring(0,1)))));
            }
        } else if (!$title.text()) {
            $title.text(gettext('Tests'));
        }
        $('.tier-results', this.$dom).removeClass('ajax-loading');
    };

    function MsgVisitor(suite, data) {
        this.$suite = suite;
        this.data = data;
        this.$results = $('.results', suite);
        this.msgSet = {};
        this.tiers = {};
        this.appTrans = null;
        this.versionChangeLinks = null;
        this.allCounts = {error: 0, warning: 0};
    }

    MsgVisitor.prototype.createTier = function(tierId, options) {
        var tier = new ResultsTier(this.$suite, tierId,
                                   this.tierOptions(options));
        return tier;
    };

    MsgVisitor.prototype.finish = function(msg) {
        var self = this;
        $('.result', this.$suite).each(function(i, res) {
            if (!$('.msg', res).length) {
                // No messages so no tier was created.
                self.getTier($('.tier-results', res).attr('data-tier'));
            }
        });
        $.each(this.tiers, function(tierId, tier) {
            var tierSum = tier.summarize();
            self.allCounts.error += tierSum.error;
            self.allCounts.warning += tierSum.warning;
        });
    };

    MsgVisitor.prototype.getMsgType = function(msg) {
         return msg['type'];
    };

    MsgVisitor.prototype.getTier = function(tierId, options) {
        if (typeof options === 'undefined')
            options = {app: null};
        if (!options.app
            && this.data.validation.ending_tier
            && this.data.validation.ending_tier < tierId) {
            options.testsWereRun = false;
        }
        if (typeof this.tiers[tierId] === 'undefined')
            this.tiers[tierId] = this.createTier(tierId, options);
        return this.tiers[tierId];
    };

    MsgVisitor.prototype.message = function(msg, options) {
        if (typeof this.msgSet[msg.uid] !== 'undefined')
            return;
        this.msgSet[msg.uid] = true;
        var tier = this.getTier(msg.tier, options),
            msgDiv = $('<div class="msg"><h5></h5></div>'),
            effectiveType = this.getMsgType(msg),
            prefix = effectiveType=='error' ? gettext('Error')
                                            : gettext('Warning');

        tier.tallyMsgType(effectiveType);
        msgDiv.attr('id', 'v-msg-' + msg.uid);
        msgDiv.addClass('msg-' + effectiveType);
        $('h5', msgDiv).html(msg.message);
        if (typeof(msg.description) === 'undefined' || msg.description === '') {
            msg.description = [];
        } else if (typeof(msg.description) === 'string') {
            // Currently it can be either of these:
            //      descripion: "foo"
            //      description: ["foo", "bar"]
            msg.description = [msg.description];
        }
        $.each(msg.description, function(i, val) {
            msgDiv.append(format('<p>{0}: {1}</p>', [prefix, val]));
        });
        if (msg.description.length == 0) {
            msgDiv.append('<p>&nbsp;</p>');
        }
        if (msg.file) {
            msgDiv.append(this.messageContext(msg));
        }
        $('.tier-results', tier.$dom).append(msgDiv);
    };

    MsgVisitor.prototype.messageContext = function(msg) {
        var ctxFile = msg.file, ctxDiv, code, lines, innerCode;
        if (typeof(ctxFile) === 'string') {
            ctxFile = [ctxFile];
        }
        // e.g. ["silvermelxt_1.3.5.xpi", "chrome/silvermelxt.jar"]
        ctxFile = joinPaths(ctxFile);
        ctxDiv = $(format('<div class="context">' +
                          '<div class="file">{0}</div></div>', [ctxFile]));
        if (msg.context) {
            code = $('<div class="code"></div>');
            lines = $('<div class="lines"></div>');
            code.append(lines);
            innerCode = $('<div class="inner-code"></div>');
            code.append(innerCode);
            msg.context = formatCodeIndentation(msg.context);
            $.each(msg.context, function(n, c) {
                if (c == "") { return }
                // The line number refers to the middle element of the context,
                // not the first. Subtract one from the index to get the
                // right line number.
                lines.append($(format('<div>{0}</div>', [msg.line + n - 1])));
                innerCode.append($(format('<div>{0}</div>', [c])));
            });
            ctxDiv.append(code);
        }
        return ctxDiv;
    };

    MsgVisitor.prototype.tierOptions = function(options) {
        if (options && options.app) {
            options.app.trans = this.appTrans;
            options.app.versionChangeLinks = this.versionChangeLinks;
        }
        return options;
    };

    var CompatMsgVisitor = inherit(MsgVisitor, function(suite, data) {
        var self = this;
        this.appTrans = JSON.parse(this.$results.attr('data-app-trans'));
        this.versionChangeLinks = JSON.parse(this.$results.attr('data-version-change-links'));
        this.majorTargetVer = JSON.parse(this.$results.attr('data-target-version'));
        $.each(this.majorTargetVer, function(guid, version) {
            // 4.0b3 -> 4
            self.majorTargetVer[guid] = version.split('.')[0];
        });
    });

    CompatMsgVisitor.prototype.finish = function(msg) {
        MsgVisitor.prototype.finish.apply(this, arguments);
        // Since results are more dynamic on the compatibility page,
        // hide tiers without messages.
        $('.result', this.$suite).each(function(i, res) {
            if (!$('.msg', res).length)
                $(res).hide();
        });
        if (this.allCounts.error == 0 && this.allCounts.warning == 0) {
            $('#suite-results-tier-1').show();
            $('#suite-results-tier-1 h4').text(gettext('Compatibility Tests'));
        }
    };

    CompatMsgVisitor.prototype.getMsgType = function(msg) {
        return msg.compatibility_type ? msg.compatibility_type: msg['type'];
    };

    CompatMsgVisitor.prototype.message = function(msg) {
        var self = this, effectiveType = this.getMsgType(msg);
        if (msg.for_appversions) {
            eachAppVer(msg.for_appversions, function(guid, version, id) {
                var app = {guid: guid, version: version, id: id};
                if (version.split('.')[0] != self.majorTargetVer[guid])
                    // Since some errors span multiple versions, we only
                    // care about the first one specific to this target
                    return true;
                msg.tier = id;  // change the tier to match app/version
                MsgVisitor.prototype.message.apply(self, [msg, {app: app}]);
            });
        } else {
            if (effectiveType !== 'error')
                // For non-appversion messages, only show errors
                return;
            MsgVisitor.prototype.message.apply(this, arguments);
        }
    };

    CompatMsgVisitor.prototype.tierOptions = function(options) {
        options = MsgVisitor.prototype.tierOptions.apply(this, arguments);
        return options;
    };

    function buildResults(suite, data) {
        var vis,
            validation = data.validation,
            summaryTxt;

        if ($('.results', suite).hasClass('compatibility-results'))
            vis = new CompatMsgVisitor(suite, data);
        else
            vis = new MsgVisitor(suite, data);
        $.each(validation.messages, function(i, msg) {
            vis.message(msg);
        });
        vis.finish();

        if (validation.errors > 0) {
            summaryTxt = gettext('Add-on failed validation.');
        } else {
            summaryTxt = gettext('Add-on passed validation.');
        }
        $('.suite-summary span', suite).text(summaryTxt);
        $('.suite-summary', suite).show();
    }

    function eachAppVer(appVer, visit) {
        // Iterates an application/version map and calls
        // visit(gui, version, key) for each item.
        //
        // e.g. {'{ec8030f7-c20a-464f-9b0e-13a3a9e97384}':["4.0b1"]}
        // ->
        //      visit('{ec8030f7-c20a-464f-9b0e-13a3a9e97384}',
        //            "4.0b1",
        //            'ec8030f7-c20a-464f-9b0e-13a3a9e97384-40b1')
        if (appVer) {
            $.each(appVer, function(guid, all_versions) {
                $.each(all_versions, function(i, version) {
                    var key = (guid + '-' + version).replace(/[^a-z0-9_-]+/gi, '');
                    visit(guid, version, key);
                });
            });
        }
    }

    function resultSummary(numErrors, numWarnings) {
        // e.g. '1 error, 3 warnings'
        var errors = format(ngettext('{0} error', '{0} errors', numErrors),
                            [numErrors]),
            warnings = format(ngettext('{0} warning', '{0} warnings', numWarnings),
                              [numWarnings]);
        return format('{0}, {1}', errors, warnings);
    }

    function joinPaths(parts) {
        var p = '';
        $.each(parts, function(i, part) {
            if (!part || typeof(part) !== 'string') {
                // Might be null or empty string.
                return;
            }
            if (p.length) {
                p += '/';
                if (part.substring(0,1) === '/') {
                    // Prevent double slashes.
                    part = part.substring(1);
                }
            }
            p += part;
        });
        return p;
    }

    function formatCodeIndentation(lines) {
        var indent = null;
        $.each(lines, function(i, code) {
            if (code === null) {
                code = ''; // blank line
            }
            lines[i] = code;
            var m = code.length - code.replace(/^\s+/, '').length;
            if (indent === null) {
                indent = m;
            }
            // Look for the smallest common indent of white space.
            if (m < indent) {
                indent = m;
            }
        });
        $.each(lines, function(i, code) {
            if (indent > 0) {
                // Dedent all code to common level.
                code = code.substring(indent);
                lines[i] = code;
            }
            var n = code.search(/[^\s]/); // first non-space char
            if (n > 0) {
                lines[i] = '';
                // Add back the original indentation.
                for (var x=0; x<n; x++) {
                    lines[i] += '&nbsp;';
                }
                lines[i] += $.trim(code);
            }
        });
        return lines;
    }

    $('.addon-validator-suite').live('validate', function(e) {
        var el = $(this),
            url = el.attr('data-validateurl');

        $('.test-tier,.tier-results', el).addClass('ajax-loading');

        $.ajax({type: 'POST',
                url: url,
                data: {},
                success: function(data) {
                    if (data.validation == '') {
                        // Note: traceback is in data.error
                        data.validation = {
                            ending_tier: 1,
                            messages: [{
                                'type':'error',
                                message: gettext('Error'),
                                description: [
                                    gettext('Validation task could not ' +
                                            'complete or completed with ' +
                                            'errors')],
                                tier: 1,
                                uid: '__global_error__'
                            }]
                        };
                    }
                    buildResults(el, data);
                },
                error: function(XMLHttpRequest, textStatus, errorThrown) {
                    buildResults(el, {
                        validation: {
                            ending_tier: 1,
                            messages: [{
                                'type':'error',
                                message: gettext('Error'),
                                description: [gettext('Internal server error')],
                                tier: 1,
                                uid: '__global_error__'
                            }]
                        }
                    });
                },
                dataType: 'json'
        });
    });

    // Validate when the page loads.
    $('#addon-validator-suite').trigger('validate');

};
$(document).ready(function() {

    if ($('#packager').length) {
        $('#packager').delegate('.app input:checkbox', 'change', function() {
            var $this = $(this),
                $li = $this.closest('li');
            if ($this.is(':checked')) {
                $li.addClass('selected');
            } else {
                $li.removeClass('selected');
            }
        });
        $('#packager .app input:checkbox').trigger('change');
    }

    if ($('#packager-download').length) {
        $('#packager-download').live('download', function(e) {
            var $this = $(this),
                url = $this.attr('data-downloadurl');
            function fetch_download() {
                $.getJSON(url, function(json) {
                    if (json !== null && 'download_url' in json) {
                        var a = template(
                            '<a href="{url}">{text}<b>{size} {unit}</b></a>'
                        );
                        // L10n: "kB" is for kilobytes, denoting the file size.
                        $this.html(a({
                            url: json['download_url'],
                            text: gettext('Download ZIP'),
                            size: json['size'],
                            unit: gettext('kB')
                        }));
                    } else {
                        // Pause before polling again.
                        setTimeout(fetch_download, 2000);
                    }
                });
            }
            fetch_download();
        });
        $('#packager-download').trigger('download');
    }

});

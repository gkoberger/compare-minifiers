(function(){
    "use strict";

    // Add sphinx-like links to headings with ids.
    $(function(){
        var html = '<a class="headerlink" href="#{0}">&para;</a>';
        $(':-moz-any(h1,h2,h3,h4,h5,h6)[id]').each(function() {
          console.log(format(html, $(this).attr('id')));
          $(this).append(format(html, $(this).attr('id')));
        });
    });

    $(document).ready(function() {
        $('input.searchbar').each(function() {
            var $form = $(this).closest('form');
            $(this).autocomplete({
                minLength: 3,
                width: 300,
                source: function(request, response) {
                    $.getJSON($form.attr('data-search-url') + '?' + $form.serialize(),
                              response);
                },
                focus: function(event, ui) {
                    $(this).val(ui.item.label);
                    event.preventDefault();
                },
                select: function(event, ui) {
                    window.location = $form.attr('action') + '/' + ui.item.value;
                    event.preventDefault();
                }
            });
            $form.bind('submit', _pd(function() {
                // Prevent just submitting the form because that takes you
                // to your page. TODO: do something clever with this.
            }));
        });
    });
})();
$(document).ready(function(){
    function incTotalForms() {
        var $totalForms = $('#id_form-TOTAL_FORMS'),
            num = parseInt($totalForms.val()) + 1;
        $totalForms.val(num);
        return num;
    }

    // Populate cells with current collections.
    $('#features td.collection').each(function() {
        var $td = $(this),
            cid = $td.attr('data-collection'),
            $input = $td.find('.collection-ac');
        if (!cid) {
            $td.removeClass('loading');
            $input.show();
            return;
        }
        $.post(document.body.getAttribute('data-featured-collection-url'),
               {'collection': cid}, function(data) {
            $td.removeClass('loading');
            $input.hide();
            $td.find('.current-collection').html(data).show();
        });
    });

    $('#features').delegate('.app select', 'change', function() {
        // Update application id and toggle disabled attr on autocomplete field.
        var $this = $(this),
            $tr = $this.closest('tr'),
            val = $this.val();
        $tr.attr('data-app', val);
        $tr.find('.collection-ac').attr('disabled', !val);
    });
    $('#features').delegate('.remove', 'click', _pd(function() {
        $(this).closest('tr').hide();
        $(this).closest('td').find('input').attr('checked', true);
    }));
    $('#features').delegate('.replace', 'click', _pd(function() {
        var $td = $(this).closest('td');
        $td.find('.collection-ac').show();
        $td.find('input[type=hidden]').val('');
        $(this).parent().html('');
    })).delegate('.collection-ac', 'collectionAdd', function() {
        // Autocomplete for collection add form.
        var $input = $(this),
            $tr = $input.closest('tr'),
            $td = $input.closest('td'),
            $select = $tr.find('.collection-select');
        function selectCollection() {
            var item = JSON.parse($input.attr('data-item'));
            if (item) {
                $td.find('.errorlist').remove();
                var current = template(
                    '<a href="{url}" target="_blank" ' +
                    'class="collectionitem {is_personas}">{name}</a>' +
                    '<a href="#" class="replace">Replace with another collection</a>'
                );
                $td.find('.current-collection').show().html(current({
                    url: item.url,
                    is_personas: item.all_personas ? 'personas-collection' : '',
                    name: item.name
                }));
                $td.find('input[type=hidden]').val(item.id);
                $td.attr('data-collection', item.id);
            }
            $input.val('');
            $input.hide();
        }
        $input.autocomplete({
            minLength: 3,
            width: 300,
            source: function(request, response) {
                $.getJSON(document.body.getAttribute('data-collections-url'),
                          {'app': $input.closest('tr').attr('data-app'),
                           'q': request.term}, response);
            },
            focus: function(event, ui) {
                $input.val(ui.item.name);
                return false;
            },
            select: function(event, ui) {
                $input.val(ui.item.name).attr('data-item', JSON.stringify(ui.item));
                selectCollection();
                return false;
            }
        }).data('autocomplete')._renderItem = function(ul, item) {
            var html = format('<a>{0}<b>ID: {1}</b></a>', [item.name, item.id]);
            return $('<li>').data('item.autocomplete', item).append(html).appendTo(ul);
        };
    });

    $('#features .collection-ac').trigger('collectionAdd');

    $('#add').click(_pd(function() {
        var formId = incTotalForms() - 1,
            emptyForm = $('tfoot').html().replace(/__prefix__/g, formId);
        $('tbody').append(emptyForm);
        $('tbody tr:last-child .collection-ac').trigger('collectionAdd');
    }));
});
(function() {
"use strict";

$(function() {
    if ($('#admin-validation').length) {
        initAdminValidation($('#admin-validation'));
    }
});


function initAdminValidation(doc) {
    var $elem = $('#id_application', doc),
        statInterval,
        incompleteJobs = {};

    $elem.change(function(e) {
        var maxVer = $('#id_curr_max_version, #id_target_version', doc),
            sel = $(e.target),
            appId = $('option:selected', sel).val();

        if (!appId) {
            $('option', maxVer).remove();
            maxVer.append(format('<option value="{0}">{1}</option>',
                                 ['', gettext('Select an application first')]));
            return;
        }
        $.post(sel.attr('data-url'), {'application_id': appId}, function(d) {
            $('option', maxVer).remove();
            $.each(d.choices, function(i, ch) {
                maxVer.append(format('<option value="{0}">{1}</option>',
                                     [ch[0], ch[1]]));
            });
        });
    });

    if ($elem.children('option:selected').val() &&
        !$('#id_curr_max_version option:selected, ' +
           '#id_target_version option:selected', doc).val()) {
        // If an app is selected when page loads and it's not a form post.
        $elem.trigger('change');
    }

    var $popup = $('#notify').popup('td a.v-popup', {
        width: '600px',
        callback: function(obj) {
            var $ct = $(obj.click_target),
                msg = '',
                form = '';
            if ($ct.hasClass('set-max-version')) {
                // L10n: {0} is the number of add-ons, {1} is a version like 4.0
                msg = ngettext('Set {0} add-on to a max version of {1} and email the author.',
                               'Set {0} add-ons to a max version of {1} and email the authors',
                               $ct.attr('data-job-count'));
                msg = format(msg, [$ct.attr('data-job-count'), $ct.attr('data-job-version')]);
                form = $('#success-form').html();
            } else {
                msg = ngettext('This will send emails to the authors of {0} file.',
                               'This will send emails to the authors of {0} files.',
                               $ct.attr('data-notify-count'));
                msg = format(msg, [$ct.attr('data-notify-count')]);
                form = $('#failure-form').html();
            }
            $(this).find('p.error').text('');  // clear any existing errors.
            $(this).find('p').eq(0).text(msg);
            $(this).children('form').attr('action', $ct.attr('data-job-url'));
            $(this).find('div').eq(1).html(form); // note eq(0) is the csrf hidden div
            return { pointTo: $ct };
        }
    });

    $('#notify form').submit(function(e) {
        var $form = $(this);
        if ($form.attr('data-valid') != 'valid') {
            $.post($form.attr('data-url'), $(this).serialize(), function(json) {
                if (json && json.valid) {
                    $form.attr('data-valid', 'valid').submit();
                } else {
                    $form.find('p.error').text(json.error).show();
                }
            });
            e.preventDefault();
            return false;
        } else {
            return true;
        }
    });
    $('#notify form span.cancel a').click(_pd(function() {
        $popup.hideMe();
    }));

    function startStats() {
        var incompleteJobIds = [],
            checkStatus;
        $('tr.job-result').each(function(i, el) {
            var $el = $(el),
                $td = $el.children('td.tests-finished'),
                isComplete = parseInt($el.attr('data-is-complete'), 10),
                jobId = parseInt($el.attr('data-job-id'), 10);
            if (!isComplete) {
                incompleteJobIds.push(jobId);
                incompleteJobs[jobId] = $td;
                createProgressBar($td);
            }
        });
        if (incompleteJobIds.length) {
            var checkStatus = function() {
                $('#admin-validation').trigger('checkstats', [incompleteJobIds]);
            };
            checkStatus();
            statInterval = setInterval(checkStatus, 3000);
        }
    }

    startStats();

    $('td').bind('receivestats', function(ev, stats) {
        var $el = $(this),
            $tr = $el.parent(),
            complete = stats.percent_complete;
        $tr.children('td.tested').text(stats.total);
        $tr.children('td.failing').text(stats.failing);
        $tr.children('td.passing').text(stats.passing);
        $tr.children('td.exceptions').text(stats.errors);
        $('.job-status-bar div', $el).animate({'width': complete + '%'},
                                              {duration: 500});
        if (stats.completed_timestamp != '') {
            delete incompleteJobs[stats.job_id];
            $('.job-status-bar', $el).remove();
            $el.text(stats.completed_timestamp);
            jobCompleted();
        }
    });

    $('#admin-validation').bind('checkstats', function(ev, job_ids) {
        $.ajax({type: 'POST',
                url: $(this).attr('data-status-url'),
                data: {job_ids: JSON.stringify(job_ids)},
                cache: false,
                success: function(data) {
                    $.each(data, function(jobId, stats) {
                        if (incompleteJobs[jobId]) {
                            incompleteJobs[jobId].trigger('receivestats', [stats]);
                        } else {
                            if (typeof console !== 'undefined')
                                console.log('checkstats: Job ID does not exist: ' + jobId);
                        }
                    });
                },
                error: function(XMLHttpRequest, textStatus, errorThrown) {
                    if (typeof console !== 'undefined')
                        console.log('error: ' + textStatus);
                },
                dataType: 'json'
        });
    });

    function createProgressBar($el) {
        var bar = {};
        bar.progress_outside = $('<div>', {'class': 'job-status-bar'});
        bar.progress_inside = $('<div>').css('width', 0);
        bar.progress_outside.append(bar.progress_inside);
        $el.append(bar.progress_outside);
        bar.progress_outside.show();
    }

    function jobCompleted() {
        var allDone = true;
        $.each(incompleteJobs, function(jobId, el) {
            allDone = false;
        });
        if (allDone) {
            clearInterval(statInterval);
        }
    }
}

})();


// Assumes the following pattern for meta reviews and official reviews:
// CONFERENCE + '/-/Paper' + number + '/Meta_Review'
// CONFERENCE + '/-/Paper' + number + '/Official_Review'

// Constants
var HEADER_TEXT = 'Program Chairs Console';

var CONFERENCE = 'ICLR.cc/2019/Conference';
var INVITATION = CONFERENCE + '/-/Submission';
var BLIND_INVITATION = CONFERENCE + '/-/Blind_Submission';
var RECRUIT_REVIEWERS = CONFERENCE + '/-/Recruit_Reviewers';
var WILDCARD_INVITATION = CONFERENCE + '/-/.*';
var OFFICIAL_REVIEW_INVITATION = WILDCARD_INVITATION + '/Official_Review';
var METAREVIEW_INVITATION = WILDCARD_INVITATION + '/Meta_Review';

var ANONREVIEWER_WILDCARD = CONFERENCE + '/Paper.*/AnonReviewer.*';
var AREACHAIR_WILDCARD = CONFERENCE + '/Paper.*/Area_Chairs';

var ANONREVIEWER_REGEX = /^ICLR\.cc\/2019\/Conference\/Paper(\d+)\/AnonReviewer(\d+)/;
var AREACHAIR_REGEX = /^ICLR\.cc\/2019\/Conference\/Paper(\d+)\/Area_Chair/;

var INSTRUCTIONS = '<p class="dark">This page provides information and status \
  updates for ICLR 2019 Program Chairs. It will be regularly updated as the conference \
  progresses, so please check back frequently for news and other updates.</p>';

// Ajax functions
var getPaperNumbersfromGroups = function(groups) {
  return _.map(
    _.filter(groups, function(g) { return AREACHAIR_REGEX.test(g.id); }),
    function(fg) { return parseInt(fg.id.match(AREACHAIR_REGEX)[1], 10); }
  );
};

var getBlindedNotes = function() {
  return Webfield.getAll('/notes', {
    invitation: BLIND_INVITATION, noDetails: true
  });
};

var getOfficialReviews = function(noteNumbers) {
  if (!noteNumbers.length) {
    return $.Deferred().resolve({});
  }

  var noteMap = buildNoteMap(noteNumbers);

  return Webfield.getAll('/notes', {
    invitation: OFFICIAL_REVIEW_INVITATION, noDetails: true
  })
  .then(function(notes) {
    var ratingExp = /^(\d+): .*/;

    _.forEach(notes, function(n) {
      var num, index, ratingMatch;
      var matches = n.signatures[0].match(ANONREVIEWER_REGEX);
      if (matches) {
        num = parseInt(matches[1], 10);
        index = parseInt(matches[2], 10);

        if (num in noteMap) {
          ratingMatch = n.content.rating.match(ratingExp);
          n.rating = ratingMatch ? parseInt(ratingMatch[1], 10) : null;
          confidenceMatch = n.content.confidence.match(ratingExp);
          n.confidence = confidenceMatch ? parseInt(confidenceMatch[1], 10) : null;

          noteMap[num][index] = n;
        }
      }
    });

    return noteMap;
  });
};

var getReviewerGroups = function(noteNumbers) {
  var noteMap = buildNoteMap(noteNumbers);
  var reviewerMap = {};

  return Webfield.getAll('/groups', { id: ANONREVIEWER_WILDCARD })
    .then(function(groups) {
      var re = ANONREVIEWER_REGEX;

      _.forEach(groups, function(g) {
        var matches = g.id.match(re);
        var num, index;
        if (matches) {
          num = parseInt(matches[1], 10);
          index = parseInt(matches[2], 10);

          if (g.members.length) {
            var reviewer = g.members[0];
            if ((num in noteMap)) {
              noteMap[num][index] = reviewer;
            }

            if (!(reviewer in reviewerMap)) {
              reviewerMap[reviewer] = [];
            }

            reviewerMap[reviewer].push(num);
          }

        }
      });
      return {
        byNotes: noteMap,
        byReviewers: reviewerMap
      };
    })
    .fail(function(error) {
      displayError();
      return null;
    });
};

var getAreaChairGroups = function(noteNumbers) {
  var noteMap = buildNoteMap(noteNumbers);
  var areaChairMap = {};

  return Webfield.getAll('/groups', { id: AREACHAIR_WILDCARD })
    .then(function(groups) {
      var re = AREACHAIR_REGEX;

      _.forEach(groups, function(g) {
        var matches = g.id.match(re);
        var num;
        if (matches) {
          num = parseInt(matches[1], 10);

          if (g.members.length) {
            var areaChair = g.members[0];
            if (num in noteMap) {
              noteMap[num][0] = areaChair;
            }

            if (!(areaChair in areaChairMap)) {
              areaChairMap[areaChair] = [];
            }
            areaChairMap[areaChair].push(num);
          }
        }
      });
      return {
        byNotes: noteMap,
        byAreaChairs: areaChairMap
      };
    })
    .fail(function(error) {
      displayError();
      return null;
    });
};

var getUserProfiles = function(userIds) {
  return $.post('/user/profiles', JSON.stringify({ids: userIds}))
  .then(function(result) {

    var profileMap = {};

    _.forEach(result.profiles, function(profile) {

      var name = _.find(profile.content.names, ['preferred', true]) || _.first(profile.content.names);
      profile.name = _.isEmpty(name) ? view.prettyId(profile.id) : name.first + ' ' + name.last;
      profile.email = profile.content.preferredEmail || profile.content.emails[0];
      profileMap[profile.id] = profile;
    })

    return profileMap;
  })
  .fail(function(error) {
    displayError();
    return null;
  });
};

var findProfile = function(profiles, id) {
  var profile = profiles[id];
  if (profile) {
    return profile;
  } else {
    return {
      id: id,
      name: '',
      email: id
    }
  }
}

var getMetaReviews = function() {
  return Webfield.getAll('/notes', {
    invitation: METAREVIEW_INVITATION, noDetails: true
  });
};


// Render functions
var displayHeader = function() {
  Webfield.ui.setup('#group-container', CONFERENCE);
  Webfield.ui.header(HEADER_TEXT, INSTRUCTIONS);

  var loadingMessage = '<p class="empty-message">Loading...</p>';
  Webfield.ui.tabPanel([
    {
      heading: 'Paper Status',
      id: 'paper-status',
      content: loadingMessage,
      extraClasses: 'horizontal-scroll',
      active: true
    },
    {
      heading: 'Area Chair Status',
      id: 'areachair-status',
      content: loadingMessage,
      extraClasses: 'horizontal-scroll'
    },
    {
      heading: 'Reviewer Status',
      id: 'reviewer-status',
      content: loadingMessage,
      extraClasses: 'horizontal-scroll'
    }
  ]);
};

var displaySortPanel = function(container, sortOptions, sortResults) {

  var allOptions = _.map(_.keys(sortOptions), function(option) {
    return '<option value="' + option + '">' + option.replace(/_/g, ' ') + '</option>';
  });
  var sortBarHTML = '<form class="form-inline search-form" role="search">' +
    '<strong>Sort By:</strong>' +
    '<div class="form-group search-content" style="margin-right: 0;">' +
      '<select id="form-sort" class="form-control" style="width: 330px">' + allOptions.join('') + '</select>' +
    '</div>' +
    '<button id="form-order" class="btn" style="min-width:auto;"><span class="glyphicon glyphicon-sort"></span></button>' +
    '</form>';

  $(container).empty().append(sortBarHTML);
  $(container).on('change', 'select#form-sort', function(event) {
    sortResults($(event.target).val(), false);
  });
  $(container).on('click', '#form-order', function(event) {
    sortResults($(container).find('#form-sort').val(), true);
    return false;
  });
};

var displayPaperStatusTable = function(profiles, notes, completedReviews, metaReviews, reviewerIds, areachairIds, container, options) {

  var rowData = _.map(notes, function(note) {
    var revIds = reviewerIds[note.number];
    for (var revNumber in revIds) {
      var id = revIds[revNumber];
      revIds[revNumber] = findProfile(profiles, id);

    }

    var areachairId = areachairIds[note.number][0];
    var areachairProfile = {}

    if (areachairId) {
      areachairProfile = findProfile(profiles, areachairId);
    } else {
      areachairProfile.name = view.prettyId(CONFERENCE + '/-/Paper' + note.number + '/Area_Chair');
      areachairProfile.email = '-';
    }
    var metaReview = _.find(metaReviews, ['invitation', CONFERENCE + '/-/Paper' + note.number + '/Meta_Review']);
    return buildPaperTableRow(note, revIds, completedReviews[note.number], metaReview, areachairProfile);
  });

  var toNumber = function(value) {
    return value == 'N/A' ? 0 : value;
  }

  var order = 'desc';
  var sortOptions = {
    Paper_Number: function(row) { return row.note.number; },
    Paper_Title: function(row) { return _.toLower(_.trim(row.note.content.title)); },
    Average_Rating: function(row) { return toNumber(row.reviewProgressData.averageRating); },
    Max_Rating: function(row) { return toNumber(row.reviewProgressData.maxRating); },
    Min_Rating: function(row) { return toNumber(row.reviewProgressData.minRating); },
    Average_Confidence: function(row) { return toNumber(row.reviewProgressData.averageConfidence); },
    Max_Confidence: function(row) { return toNumber(row.reviewProgressData.maxConfidence); },
    Min_Confidence: function(row) { return toNumber(row.reviewProgressData.minConfidence); },
    Reviewers_Assigned: function(row) { return row.reviewProgressData.numReviewers; },
    Reviews_Submitted: function(row) { return row.reviewProgressData.numSubmittedReviews; },
    Reviews_Missing: function(row) { return row.reviewProgressData.numReviewers - row.reviewProgressData.numSubmittedReviews; },
    Meta_Review_Missing: function(row) { return row.areachairProgressData.numMetaReview; }
  };

  var sortResults = function(newOption, switchOrder) {
    if (switchOrder) {
      order = (order == 'asc' ? 'desc' : 'asc');
    }

    var selectedOption = newOption;
    rowData = _.orderBy(rowData, sortOptions[selectedOption], order);
    renderTable(container, rowData);
  }

  var renderTable = function(container, data) {
    var rowData = _.map(data, function(d) {
      var number = '<strong class="note-number">' + d.note.number + '</strong>';
      var summaryHtml = Handlebars.templates.noteSummary(d.note);
      var reviewHtml = Handlebars.templates.noteReviewers(d.reviewProgressData);
      var areachairHtml = Handlebars.templates.noteAreaChairs(d.areachairProgressData);
      return [number, summaryHtml, reviewHtml, areachairHtml];
    });

    var tableHTML = Handlebars.templates['components/table']({
      headings: ['#', 'Paper Summary', 'Review Progress', 'Status'],
      rows: rowData,
      extraClasses: 'console-table paper-table'
    });

    $(container).find('.table-container').remove();
    $(container).append(tableHTML);
  }

  if (rowData.length) {
    displaySortPanel(container, sortOptions, sortResults);
    renderTable(container, rowData);
  } else {
    $(container).empty().append('<p class="empty-message">No papers have been submitted. ' +
      'Check back later or contact info@openreview.net if you believe this to be an error.</p>');
  }

};

var displaySPCStatusTable = function(profiles, notes, completedReviews, metaReviews, reviewerIds, areachairIds, container, options) {

  var rowData = [];
  var index = 1;
  var sortedAreaChairIds = _.sortBy(_.keys(areachairIds));
  _.forEach(sortedAreaChairIds, function(areaChair) {
    var numbers = areachairIds[areaChair];

    var papers = [];
    _.forEach(numbers, function(number) {
      var note = _.find(notes, ['number', number]);

      if (note) {
        var reviewers = reviewerIds[number];
        var reviews = completedReviews[number];
        var metaReview = _.find(metaReviews, ['invitation', CONFERENCE + '/-/Paper' + number + '/Meta_Review']);

        papers.push({
          note: note,
          reviewers: reviewers,
          reviews: reviews,
          metaReview: metaReview
        });
      }

    });

    var areaChairProfile = findProfile(profiles, areaChair);
    rowData.push(buildSPCTableRow(index, areaChairProfile, papers));
    index++;
  });

  var order = 'asc';
  var sortOptions = {
    Area_Chair: function(row) { return row.summary.name; },
    Papers_Assigned: function(row) { return row.reviewProgressData.numPapers; },
    Papers_with_Completed_Review_Missing: function(row) { return row.reviewProgressData.numPapers - row.reviewProgressData.numCompletedReviews; },
    Papers_with_Completed_Review: function(row) { return row.reviewProgressData.numCompletedReviews; },
    Papers_with_Completed_MetaReview_Missing: function(row) { return row.reviewProgressData.numPapers - row.reviewProgressData.numCompletedMetaReviews; },
    Papers_with_Completed_MetaReview: function(row) { return row.reviewProgressData.numCompletedMetaReviews; }
  };

  var sortResults = function(newOption, switchOrder) {
    if (switchOrder) {
      order = (order == 'asc' ? 'desc' : 'asc');
    }

    var selectedOption = newOption;
    rowData = _.orderBy(rowData, sortOptions[selectedOption], order);
    renderTable(container, rowData);
  }

  var renderTable = function(container, data) {

    var index = 1;
    var rowData = _.map(data, function(d) {
      var number = '<strong class="note-number">' + index++ + '</strong>';
      var summaryHtml = Handlebars.templates.committeeSummary(d.summary);
      var progressHtml = Handlebars.templates.notesAreaChairProgress(d.reviewProgressData);
      var statusHtml = Handlebars.templates.notesAreaChairStatus(d.reviewProgressData);
      return [number, summaryHtml, progressHtml, statusHtml];
    });

    var tableHTML = Handlebars.templates['components/table']({
      headings: ['#', 'Area Chair', 'Review Progress', 'Status'],
      rows: rowData,
      extraClasses: 'console-table'
    });

    $(container).find('.table-container').remove();
    $(container).append(tableHTML);
  }

  displaySortPanel(container, sortOptions, sortResults);
  renderTable(container, rowData);


};

var displayPCStatusTable = function(profiles, notes, completedReviews, metaReviews, reviewerByNote, reviewerById, container, options) {
  var rowData = [];
  var index = 1;
  var sortedReviewerIds = _.sortBy(_.keys(reviewerById));

  _.forEach(sortedReviewerIds, function(reviewer) {
    var numbers = reviewerById[reviewer];

    var papers = [];
    _.forEach(numbers, function(number) {
      var note = _.find(notes, ['number', number]);

      if (note) {
        var reviewerNum = 0;
        var reviewers = reviewerByNote[number];


        for (var revNumber in reviewers) {
          if (reviewer == reviewers[revNumber].id) {
            reviewerNum = revNumber;
            break;
          }
        }

        var reviews = completedReviews[number];
        var review = reviews[reviewerNum];
        var metaReview = _.find(metaReviews, ['invitation', CONFERENCE + '/-/Paper' + number + '/Meta_Review']);

        papers.push({
          note: note,
          review: review,
          reviewers: reviewers,
          reviews: reviews,
          metaReview: metaReview
        });
      }

    });

    var reviewerProfile = findProfile(profiles, reviewer);
    rowData.push(buildPCTableRow(index, reviewerProfile, papers));
    index++;
  });

  var order = 'asc';
  var sortOptions = {
    Reviewer: function(row) { return row.summary.name; },
    Papers_Assigned: function(row) { return row.reviewProgressData.numPapers; },
    Papers_with_Reviews_Missing: function(row) { return row.reviewProgressData.numPapers - row.reviewProgressData.numCompletedReviews; },
    Papers_with_Reviews_Submitted: function(row) { return row.reviewProgressData.numCompletedReviews; },
    Papers_with_Completed_Reviews_Missing: function(row) { return row.reviewStatusData.numPapers - row.reviewStatusData.numCompletedReviews; },
    Papers_with_Completed_Reviews: function(row) { return row.reviewStatusData.numCompletedReviews; }
  };

  var sortResults = function(newOption, switchOrder) {
    if (switchOrder) {
      order = (order == 'asc' ? 'desc' : 'asc');
    }
    var selectedOption = newOption;
    rowData = _.orderBy(rowData, sortOptions[selectedOption], order);
    renderTable(container, rowData);
  }

  var renderTable = function(container, data) {

    var index = 1;
    var rowData = _.map(data, function(d) {
      var number = '<strong class="note-number">' + index++ + '</strong>';
      var summaryHtml = Handlebars.templates.committeeSummary(d.summary);
      var progressHtml = Handlebars.templates.notesReviewerProgress(d.reviewProgressData);
      var statusHtml = Handlebars.templates.notesReviewerStatus(d.reviewStatusData);
      return [number, summaryHtml, progressHtml, statusHtml];
    });

    var tableHTML = Handlebars.templates['components/table']({
      headings: ['#', 'Reviewer', 'Review Progress', 'Status'],
      rows: rowData,
      extraClasses: 'console-table'
    });

    $(container).find('.table-container').remove();
    $(container).append(tableHTML);
  }

  displaySortPanel(container, sortOptions, sortResults);
  renderTable(container, rowData);

};

var displayError = function(message) {
  message = message || 'The group data could not be loaded.';
  $('#notes').empty().append('<div class="alert alert-danger"><strong>Error:</strong> ' + message + '</div>');
};


// Helper functions
var buildPaperTableRow = function(note, reviewerIds, completedReviews, metaReview, areachairProfile) {
  // Build Note Summary Cell
  note.content.authors = null;  // Don't display 'Blinded Authors'

  // Build Review Progress Cell
  var reviewObj;
  var combinedObj = {};
  var ratings = [];
  var confidences = [];
  for (var reviewerNum in reviewerIds) {
    if (reviewerNum in completedReviews) {
      reviewObj = completedReviews[reviewerNum];
      combinedObj[reviewerNum] = _.assign({}, reviewerIds[reviewerNum], {
        completedReview: true,
        forum: reviewObj.forum,
        note: reviewObj.id,
        rating: reviewObj.rating,
        confidence: reviewObj.confidence,
        reviewLength: reviewObj.content.review.length
      });
      ratings.push(reviewObj.rating);
      confidences.push(reviewObj.confidence);
    } else {
      combinedObj[reviewerNum] = _.assign({}, reviewerIds[reviewerNum], {
        forumUrl: '/forum?' + $.param({
          id: note.forum,
          noteId: note.id,
          invitationId: CONFERENCE + '/-/Paper' + note.number + '/Official_Review'
        })
      });
    }
  }
  var averageRating = 'N/A';
  var minRating = 'N/A';
  var maxRating = 'N/A';
  if (ratings.length) {
    averageRating = _.round(_.sum(ratings) / ratings.length, 2);
    minRating = _.min(ratings);
    maxRating = _.max(ratings);
  }

  var averageConfidence = 'N/A';
  var minConfidence = 'N/A';
  var maxConfidence = 'N/A';
  if (confidences.length) {
    averageConfidence = _.round(_.sum(confidences) / confidences.length, 2);
    minConfidence = _.min(confidences);
    maxConfidence = _.max(confidences);
  }

  var reviewProgressData = {
    numSubmittedReviews: Object.keys(completedReviews).length,
    numReviewers: Object.keys(reviewerIds).length,
    reviewers: combinedObj,
    averageRating: averageRating,
    maxRating: maxRating,
    minRating: minRating,
    averageConfidence: averageConfidence,
    minConfidence: minConfidence,
    maxConfidence: maxConfidence,
    sendReminder: false
  };

  var areachairProgressData = {
    numMetaReview: metaReview ? 'One' : 'No',
    areachair: areachairProfile,
    metaReview: metaReview
  };

  return {
    note: note,
    reviewProgressData: reviewProgressData,
    areachairProgressData: areachairProgressData
  }
};

var buildSPCTableRow = function(index, areaChair, papers) {

  var summary = {
    id: areaChair.id,
    name: areaChair.name,
    email: areaChair.email
  }

  var numCompletedReviews = 0;
  var numCompletedMetaReviews = 0;
  var paperProgressData = _.map(papers, function(paper) {
    var ratings = [];
    var numOfReviewers = 0;

    for (var reviewerNum in paper.reviewers) {
      if (reviewerNum in paper.reviews) {
        ratings.push(paper.reviews[reviewerNum].rating);
      }
      numOfReviewers++;
    }

    var averageRating = 'N/A';
    var minRating = 'N/A';
    var maxRating = 'N/A';
    if (ratings.length) {
      averageRating = _.round(_.sum(ratings) / ratings.length, 2);
      minRating = _.min(ratings);
      maxRating = _.max(ratings);
    }

    if (ratings.length == numOfReviewers) {
      numCompletedReviews++;
    }

    if (paper.metaReview) {
      numCompletedMetaReviews++;
    }

    return {
      note: paper.note,
      averageRating: averageRating,
      maxRating: maxRating,
      minRating: minRating,
      numOfReviews: ratings.length,
      numOfReviewers: numOfReviewers,
      metaReview: paper.metaReview
    }
  });

  var reviewProgressData = {
    numCompletedMetaReviews: numCompletedMetaReviews,
    numCompletedReviews: numCompletedReviews,
    numPapers: papers.length,
    papers: _.sortBy(paperProgressData, [function(p) { return p.note.number; }])
  }

  return {
    summary: summary,
    reviewProgressData: reviewProgressData
  }

};

var buildPCTableRow = function(index, reviewer, papers) {

  var summary = {
    id: reviewer.id,
    name: reviewer.name,
    email: reviewer.email
  }

  var reviewProgressData = {
    numCompletedMetaReviews: _.size(_.filter(papers, function(p) { return p.metaReview; })),
    numCompletedReviews: _.size(_.filter(papers, function(p) { return p.review; })),
    numPapers: papers.length,
    papers: _.sortBy(papers, [function(p) { return p.note.number; }])
  }

  var numCompletedReviews = 0;
  var paperProgressData = _.map(papers, function(paper) {
    var ratings = [];
    var numOfReviewers = 0;

    for (var reviewerNum in paper.reviewers) {
      if (reviewerNum in paper.reviews) {
        ratings.push(paper.reviews[reviewerNum].rating);
      }
      numOfReviewers++;
    }

    var averageRating = 'N/A';
    var minRating = 'N/A';
    var maxRating = 'N/A';
    if (ratings.length) {
      averageRating = _.round(_.sum(ratings) / ratings.length, 2);
      minRating = _.min(ratings);
      maxRating = _.max(ratings);
    }

    if (ratings.length == numOfReviewers) {
      numCompletedReviews++;
    }

    return {
      note: paper.note,
      averageRating: averageRating,
      maxRating: maxRating,
      minRating: minRating,
      numOfReviews: ratings.length,
      numOfReviewers: numOfReviewers,
      metaReview: paper.metaReview
    }
  });

  var reviewStatusData = {
    numCompletedReviews: numCompletedReviews,
    numPapers: papers.length,
    papers: _.sortBy(paperProgressData, [function(p) { return p.note.number; }])
  }

  return {
    summary: summary,
    reviewProgressData: reviewProgressData,
    reviewStatusData: reviewStatusData
  }
};

var buildNoteMap = function(noteNumbers) {
  var noteMap = Object.create(null);
  for (var i = 0; i < noteNumbers.length; i++) {
    noteMap[noteNumbers[i]] = Object.create(null);
  }
  return noteMap;
};


// Kick the whole thing off
displayHeader();

$.ajaxSetup({
  contentType: 'application/json; charset=utf-8'
});

controller.addHandler('areachairs', {
  token: function(token) {
    var pl = model.tokenPayload(token);
    var user = pl.user;

    getBlindedNotes()
    .then(function(notes) {
      var noteNumbers = _.map(notes, function(note) { return note.number; });
      return $.when(
        notes,
        getOfficialReviews(noteNumbers),
        getMetaReviews(),
        getReviewerGroups(noteNumbers),
        getAreaChairGroups(noteNumbers)
      );
    })
    .then(function(blindedNotes, officialReviews, metaReviews, reviewerGroups, areaChairGroups) {
      var uniqueReviewerIds = _.uniq(_.reduce(reviewerGroups.byNotes, function(result, idsObj) {
        return result.concat(_.values(idsObj));
      }, []));

      var uniqueAreaChairIds = _.uniq(_.reduce(areaChairGroups.byNotes, function(result, idsObj) {
        return result.concat(_.values(idsObj));
      }, []));

      var uniqueIds = _.union(uniqueReviewerIds, uniqueAreaChairIds);

      return getUserProfiles(uniqueIds)
      .then(function(profiles) {
        displayPaperStatusTable(profiles, blindedNotes, officialReviews, metaReviews, reviewerGroups.byNotes, areaChairGroups.byNotes, '#paper-status');
        displaySPCStatusTable(profiles, blindedNotes, officialReviews, metaReviews, reviewerGroups.byNotes, areaChairGroups.byAreaChairs, '#areachair-status');
        displayPCStatusTable(profiles, blindedNotes, officialReviews, metaReviews, reviewerGroups.byNotes, reviewerGroups.byReviewers, '#reviewer-status');

        Webfield.ui.done();
      })
    })
    .fail(function(error) {
      displayError();
    });
  }
});

$('#group-container').on('click', 'a.note-contents-toggle', function(e) {
  var hiddenText = 'Show paper details';
  var visibleText = 'Hide paper details';
  var updated = $(this).text() === hiddenText ? visibleText : hiddenText;
  $(this).text(updated);
});

$('#group-container').on('click', 'a.send-reminder-link', function(e) {
  var userId = $(this).data('userId');
  var forumUrl = $(this).data('forumUrl');
  var postData = {
    subject: 'ICLR 2019 Reminder',
    message: 'This is a reminder to please submit your official reviews for ICLR 2019. ' +
      'Click on the link below to go to the review page:\n\n' + location.origin + forumUrl + '\n\nThank you.',
    groups: [userId]
  };

  $.post('/mail', JSON.stringify(postData), function(result) {
    promptMessage('A reminder email has been sent to ' + view.prettyId(userId));
  }, 'json').fail(function(error) {
    console.log(error);
    promptError('The reminder email could not be sent at this time');
  });
  return false;
});

$('#group-container').on('click', 'a.collapse-btn', function(e) {
  $(this).next().slideToggle();
  if ($(this).text() === 'Show reviewers') {
    $(this).text('Hide reviewers');
  } else {
    $(this).text('Show reviewers');
  }
  return false;
});

OpenBanner.venueHomepageLink(CONFERENCE);

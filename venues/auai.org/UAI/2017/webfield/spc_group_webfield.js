var CONFERENCE = 'auai.org/UAI/2017';

// Ajax functions
var getPaperNumbersfromGroups = function(groups) {
  var re = /^auai\.org\/UAI\/2017\/Paper(\d+)\/Area_Chair/;
  return _.map(
    _.filter(groups, function(g) { return re.test(g.id); }),
    function(fg) { return parseInt(fg.id.match(re)[1], 10); }
  );
};

var getBlindedNotes = function(noteNumbers) {
  var noteNumbersStr = noteNumbers.join(',');

  return $.getJSON('notes', { invitation: CONFERENCE + '/-/blind-submission', number: noteNumbersStr })
    .then(function(result) {
      return result.notes;
    });
};

var getAllReviews = function(callback) {
  var invitationId = CONFERENCE + '/-/Paper.*/Submit/Review';
  var allNotes = [];

  function getPromise(offset, limit) {
    return $.getJSON('notes', { invitation: CONFERENCE + '/-/Paper.*/Submit/Review', offset: offset, limit: limit })
    .then(function(result) {
      allNotes = _.union(allNotes, result.notes);
      if (result.notes.length == limit) {
        return getPromise(offset + limit, limit);
      } else {
        callback(allNotes);
      }
    });
  };

  getPromise(0, 2000);
};

var getOfficialReviews = function(noteNumbers) {

  var dfd = $.Deferred();

  var noteMap = buildNoteMap(noteNumbers);

  getAllReviews(function(notes) {
    var re = /^auai\.org\/UAI\/2017\/Paper(\d+)\/AnonReviewer(\d+)/;
    var ratingExp = /^(\d+): .*/;

    notes.forEach(function(n) {
      var matches = n.signatures[0].match(re);
      var num, index, ratingMatch;
      if (matches) {
        num = parseInt(matches[1], 10);
        index = parseInt(matches[2], 10);

        if (num in noteMap) {
          // Need to parse rating and confidence strings into ints
          ratingMatch = n.content.rating.match(ratingExp);
          n.rating = ratingMatch ? parseInt(ratingMatch[1], 10) : null;
          confidenceMatch = n.content.confidence.match(ratingExp);
          n.confidence = confidenceMatch ? parseInt(confidenceMatch[1], 10) : null;

          noteMap[num][index] = n;
        }
      }
    });
    dfd.resolve(noteMap);

  });

  return dfd.promise();

};

var getReviewerGroups = function(noteNumbers) {
  var noteMap = buildNoteMap(noteNumbers);

  return $.getJSON('groups', { regex: 'auai.org/UAI/2017/Paper.*/AnonReviewer.*' })
    .then(function(result) {
      var re = /^auai\.org\/UAI\/2017\/Paper(\d+)\/AnonReviewer(\d+)/;

      result.groups.forEach(function(g) {
        var matches = g.id.match(re);
        var num, index;
        if (matches) {
          num = parseInt(matches[1], 10);
          index = parseInt(matches[2], 10);

          if ((num in noteMap) && g.members.length) {
            noteMap[num][index] = g.members[0];
          }
        }
      });
      return noteMap;
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
      profile.email = profile.content.preferred_email;
      profileMap[profile.id] = profile;
    })

    return profileMap;
  })
  .fail(function(error) {
    displayError();
    return null;
  });
};

var getMetaReviews = function() {
  return $.getJSON('notes', { invitation: CONFERENCE + '/-/Paper.*/Meta/Review' })
    .then(function(result) {
      return result.notes;
    }).fail(function(error) {
      displayError();
      return null;
    });
};


// Render functions
var displayHeader = function(headerP) {
  var $panel = $('#group-container');
  $panel.hide('fast', function() {
    $panel.empty().append(
      '<div id="header" class="panel">' +
        '<h1>UAI Area Chair Console</h1>' +
      '</div>' +
      '<div id="notes"><div class="tabs-container"></div></div>'
    );

    var loadingMessage = '<p class="empty-message">Loading...</p>';
    var tabsData = {
      sections: [
        {
          heading: 'Reviewer Status',
          id: 'reviewer-status',
          content: loadingMessage,
          active: true
        },
        // {
        //   heading: 'Your Assigned Papers',
        //   id: 'assigned-papers',
        //   content: loadingMessage,
        // }
      ]
    };
    $panel.find('.tabs-container').append(Handlebars.templates['components/tabs'](tabsData));

    $panel.show('fast', function() {
      headerP.resolve(true);
    });
  });
};

var displayStatusTable = function(profiles, notes, completedReviews, metaReviews, reviewerIds, container, options) {

  var rowData = _.map(notes, function(note) {
    var revIds = reviewerIds[note.number];
    for (var revNumber in revIds) {
      var profile = profiles[revIds[revNumber]];
      revIds[revNumber] = profile;
    }

    var metaReview = _.find(metaReviews, ['invitation', 'auai.org/UAI/2017/-/Paper' + note.number + '/Meta/Review']);
    return buildTableRow(note, revIds, completedReviews[note.number], metaReview);
  });

  var tableHTML = Handlebars.templates['components/table']({
    headings: ['#', 'Paper Summary', 'Review Progress', 'Status'],
    rows: rowData,
    extraClasses: 'console-table'
  });

  $(container).empty().append(tableHTML);
};

var displayError = function(message) {
  message = message || 'The group data could not be loaded.';
  $('#notes').empty().append('<div class="alert alert-danger"><strong>Error:</strong> ' + message + '</div>');
};


// Helper functions
var buildTableRow = function(note, reviewerIds, completedReviews, metaReview) {
  var number = '<strong class="note-number">' + note.number + '</strong>';

  // Build Note Summary Cell
  note.content.authors = null;  // Don't display 'Blinded Authors'
  var summaryHtml = Handlebars.templates.noteSummary(note);

  // Build Review Progress Cell
  var reviewObj;
  var combinedObj = {};
  var ratings = [];
  for (var reviewerNum in reviewerIds) {
    var reviewer = reviewerIds[reviewerNum];
    if (reviewerNum in completedReviews) {
      reviewObj = completedReviews[reviewerNum];
      combinedObj[reviewerNum] = {
        id: reviewer.id,
        name: reviewer.name,
        email: reviewer.email,
        completedReview: true,
        forum: reviewObj.forum,
        note: reviewObj.id,
        rating: reviewObj.rating,
        confidence: reviewObj.confidence,
        reviewLength: reviewObj.content.review.length
      };
      ratings.push(reviewObj.rating);
    } else {
      var forumUrl = '/forum?' + $.param({
        id: note.forum,
        noteId: note.id,
        invitationId: CONFERENCE + '/-/Paper' + note.number + '/Submit/Review'
      });
      var lastReminderSent = localStorage.getItem(forumUrl + '|' + reviewer.id);
      combinedObj[reviewerNum] = {
        id: reviewer.id,
        name: reviewer.name,
        email: reviewer.email,
        forumUrl: forumUrl,
        lastReminderSent: lastReminderSent ? new Date(parseInt(lastReminderSent)).toLocaleDateString('en-GB') : lastReminderSent
      };
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

  var reviewProgressData = {
    numSubmittedReviews: Object.keys(completedReviews).length,
    numReviewers: Object.keys(reviewerIds).length,
    reviewers: combinedObj,
    averageRating: averageRating,
    maxRating: maxRating,
    minRating: minRating,
    sendReminder: true
  };
  var reviewHtml = Handlebars.templates.noteReviewers(reviewProgressData);

  // Build Status Cell
  var invitationUrlParams = {
    id: note.forum,
    noteId: note.id,
    invitationId: CONFERENCE + '/-/Paper' + note.number + '/Meta/Review'
  };
  var reviewStatus = {
    invitationUrl: '/forum?' + $.param(invitationUrlParams)
  };
  if (metaReview) {
    reviewStatus.recommendation = metaReview.content.recommendation;
    reviewStatus.editUrl = '/forum?id=' + note.forum + '&noteId=' + metaReview.id;
  }
  var statusHtml = Handlebars.templates.noteReviewStatus(reviewStatus);

  return [number, summaryHtml, reviewHtml, statusHtml];
};

var buildNoteMap = function(noteNumbers) {
  var noteMap = Object.create(null);
  for (var i = 0; i < noteNumbers.length; i++) {
    noteMap[noteNumbers[i]] = Object.create(null);
  }
  return noteMap;
};


// Kick the whole thing off
var headerLoaded = $.Deferred();
displayHeader(headerLoaded);

$.ajaxSetup({
  contentType: 'application/json; charset=utf-8'
});

var fetchedData = {};
controller.addHandler('areachairs', {
  token: function(token) {
    var pl = model.tokenPayload(token);
    var user = pl.user;

    var userAreachairGroupsP = $.getJSON('groups', { member: user.id, regex: CONFERENCE + '/Paper.*/Area_Chair' })
      .then(function(result) {
        var noteNumbers = getPaperNumbersfromGroups(result.groups);
        return $.when(
          getBlindedNotes(noteNumbers),
          getOfficialReviews(noteNumbers),
          getMetaReviews(),
          getReviewerGroups(noteNumbers),
          headerLoaded
        );
      })
      .then(function(blindedNotes, officialReviews, metaReviews, noteToReviewerIds, loaded) {

        var uniqueIds = _.uniq(_.reduce(noteToReviewerIds, function(result, idsObj, noteNum) {
          return result.concat(_.values(idsObj));
        }, []));

        return getUserProfiles(uniqueIds)
        .then(function(profiles) {
          fetchedData = {
            profiles: profiles,
            blindedNotes: blindedNotes,
            officialReviews: officialReviews,
            metaReviews: metaReviews,
            noteToReviewerIds: noteToReviewerIds
          }
          renderTable();
        });

      })
      .fail(function(error) {
        displayError();
      });
  }
});

var renderTable = function() {
  displayStatusTable(fetchedData.profiles,
    fetchedData.blindedNotes,
    fetchedData.officialReviews,
    fetchedData.metaReviews,
    _.cloneDeep(fetchedData.noteToReviewerIds), //I need to clone this dictionary because some values are missing after the first refresh
    '#reviewer-status');
}

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
    subject: 'UAI 2017 Reminder',
    message: 'This is a reminder to please submit your review for UAI 2017. ' +
      'Click on the link below to go to the review page:\n\n' + location.origin + forumUrl + '\n\nThank you.',
    groups: [userId]
  };

  $.post('/mail', JSON.stringify(postData), function(result) {
    promptMessage('A reminder email has been sent to ' + view.prettyId(userId));
    //Save the timestamp in the local storage
    localStorage.setItem(forumUrl + '|' + userId, Date.now());
    renderTable();
  }, 'json').fail(function(error) {
    console.log(error);
    promptError('The reminder email could not be sent at this time');
  });
  return false;
});

OpenBanner.breadcrumbs([
  { link: '/', text: 'Venues' },
  { link: '/group?id=' + CONFERENCE, text: view.prettyId(CONFERENCE) }
]);

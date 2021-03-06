function(){
    var or3client = lib.or3client;
    var CONFERENCE_ID = 'AKBC.ws/2019/Conference';
    var SHORT_PHRASE = 'AKBC 2019';
    var PROGRAM_CHAIRS = CONFERENCE_ID + '/Program_Chairs';

    var forumNoteP = or3client.or3request(or3client.notesUrl + '?id=' + note.forum, {}, 'GET', token);
    var replytoNoteP = note.replyto ? or3client.or3request(or3client.notesUrl + '?id=' + note.replyto, {}, 'GET', token) : null;

    Promise.all([
      forumNoteP,
      replytoNoteP
    ]).then(function(result) {

      var forumNote = result[0].notes[0];
      var replytoNote = note.replyto ? result[1].notes[0] : null;
      var replytoNoteSignatures = replytoNote ? replytoNote.signatures : [];
      var author_mail;

      var PAPER_AUTHORS = CONFERENCE_ID + '/Paper' + forumNote.number + '/Authors';
      var PAPER_REVIEWERS = CONFERENCE_ID + '/Paper' + forumNote.number + '/Reviewers';
      var PAPER_AREACHAIRS = CONFERENCE_ID + '/Paper' + forumNote.number + '/Area_Chairs';
    
      var ac_mail = {
        'groups': [CONFERENCE_ID + '/Paper' + forumNote.number + '/Area_Chairs'],
        'subject': '[' + SHORT_PHRASE + '] Comment posted to a paper in your area. Paper title: "' + forumNote.content.title + '"',
        'message': 'A comment was posted to a paper for which you are serving as Area Chair.\n\nComment title: ' + note.content.title + '\n\nComment: ' + note.content.comment + '\n\nTo view the comment, click here: ' + baseUrl + '/forum?id=' + note.forum + '&noteId=' + note.id
      };

      var reviewer_mail = {
        'groups': [CONFERENCE_ID + '/Paper' + forumNote.number + '/Reviewers'],
        'subject': '[' + SHORT_PHRASE + '] Comment posted to a paper you are reviewing. Paper title: "' + forumNote.content.title + '"',
        'message': 'A comment was posted to a paper for which you are serving as reviewer.\n\nComment title: ' + note.content.title + '\n\nComment: ' + note.content.comment + '\n\nTo view the comment, click here: ' + baseUrl + '/forum?id=' + note.forum + '&noteId=' + note.id
      };

      var pc_mail = {
        'groups': [CONFERENCE_ID + '/Program_Chairs'],
        'subject': '[' + SHORT_PHRASE + '] A Program Chair-only comment was posted to paper title: "' + forumNote.content.title + '"',
        'message': 'A comment was posted to a paper with the comment\'s readership restricted to only the Program Chairs.\n\nComment title: ' + note.content.title + '\n\nComment: ' + note.content.comment + '\n\nTo view the comment, click here: ' + baseUrl + '/forum?id=' + note.forum + '&noteId=' + note.id
      };

      author_mail = {
        'groups': forumNote.content.authorids,
        'subject': '[' + SHORT_PHRASE + '] A comment was received on your submission. Paper title: "' + forumNote.content.title + '"',
        'message': 'Your submission "' + forumNote.content.title + '" has received a comment.\n\nComment title: ' + note.content.title + '\n\nComment: ' + note.content.comment + '\n\nTo view the comment, click here: ' + baseUrl + '/forum?id=' + note.forum + '&noteId=' + note.id
      };

      var promises = [];

      if(note.readers.includes(PAPER_AUTHORS) || note.readers.includes('everyone')){
        promises.push(or3client.or3request(or3client.mailUrl, author_mail, 'POST', token));
      }

      if(note.readers.includes(PAPER_REVIEWERS) || note.readers.includes('everyone')){
        promises.push(or3client.or3request(or3client.mailUrl, reviewer_mail, 'POST', token));
      }

      if(note.readers.includes(PAPER_AREACHAIRS) || note.readers.includes('everyone')){
        promises.push(or3client.or3request(or3client.mailUrl, ac_mail, 'POST', token));
      }

      // This rule arbitrarily invented by Michael.
      // Sends a message to Program Chairs only if the message is readable by only PCs,
      // or only ACs and PCs. This will prevent the PCs from being constantly spammed.
      if(note.readers.includes(PROGRAM_CHAIRS) &&
        !note.readers.includes('everyone') &&
        !note.readers.includes(PAPER_REVIEWERS)
        ){
        promises.push(or3client.or3request(or3client.mailUrl, pc_mail, 'POST', token));
      }

      return Promise.all(promises);
    })
    .then(result => done())
    .catch(error => done(error));

    return true;
  };

// Generated by CoffeeScript 1.9.3
(function() {
  var AWS, checkImageForDeletion, client, config, dateFormat, errors, fetchClient, fetchInstance, fetchReservation, logError, logSuccess, myEC2, name, nodemailer, smtpTransport, successes;

  config = require('./config');

  dateFormat = require('dateformat');

  AWS = require('aws-sdk');

  nodemailer = require('nodemailer');

  smtpTransport = require('nodemailer-smtp-transport');

  myEC2 = void 0;

  errors = [];

  successes = [];

  name = '';

  client = void 0;

  logError = function(message) {
    errors.push({
      name: name,
      message: message,
      time: dateFormat(new Date, 'h:MM:ss TT')
    });
    return console.error('Error', name, message);
  };

  logSuccess = function(message) {
    successes.push({
      name: name,
      message: message,
      time: dateFormat(new Date, 'h:MM:ss TT')
    });
    return console.log('Success', name, message);
  };

  checkImageForDeletion = function(index, images, cb) {
    var goToNext, image, params;
    goToNext = function() {
      if (++index < images.length) {
        return checkImageForDeletion(index, images, cb);
      } else {
        return typeof cb === "function" ? cb() : void 0;
      }
    };
    console.log('checking for deletion', index);
    image = images[index];
    if (Date.parse(image.CreationDate) < Date.now() - (client.daysToKeep * 24 * 60 * 60 * 1000)) {
      params = {
        ImageId: image.ImageId
      };
      return myEC2.deregisterImage(params, function(err, data) {
        if (!err) {
          logSuccess('Deleted Image ' + image.ImageId);
        } else {
          logError('Delete Failed ' + image.ImageId);
        }
        return goToNext();
      });
    } else {
      return goToNext();
    }
  };

  fetchInstance = function(index, instances, cb) {
    var goToNext, i, imageName, instance, isExcluded, len, now, params, ref, tag;
    goToNext = function() {
      if (++index < instances.length) {
        return fetchInstance(index, instances, cb);
      } else {
        return typeof cb === "function" ? cb() : void 0;
      }
    };
    console.log('fetching instance', index);
    instance = instances[index];
    name = '';
    isExcluded = false;
    ref = instance.Tags;
    for (i = 0, len = ref.length; i < len; i++) {
      tag = ref[i];
      if (tag.Key === 'Name') {
        name = tag.Value;
      }
      isExcluded = tag.Key === 'mis-ami-backup-excluded' && tag.Value === 'true';
    }
    if (!isExcluded) {
      now = new Date;
      imageName = name + ' - ' + dateFormat(now, 'yyyy-mm-dd');
      params = {
        InstanceId: instance.InstanceId,
        Name: imageName,
        NoReboot: true
      };
      return myEC2.createImage(params, function(err, data) {
        if (!err) {
          logSuccess('Instance backed up');
          params = {
            Resources: [data.ImageId],
            Tags: [
              {
                Key: 'mis-ami-backup',
                Value: 'true'
              }
            ]
          };
          return myEC2.createTags(params, function(err, data) {
            if (!err) {
              logSuccess('Tagged an image');
            } else {
              logError('Tagging Failed. Reason: ' + err);
            }
            return goToNext();
          });
        } else {
          logError('Backup Failed. Reason: ' + err);
          return goToNext();
        }
      });
    } else {
      return goToNext();
    }
  };

  fetchReservation = function(index, reservations, cb) {
    var goToNext, ref, reservation;
    goToNext = function() {
      if (++index < reservations.length) {
        return fetchReservation(index, reservations, cb);
      } else {
        return typeof cb === "function" ? cb() : void 0;
      }
    };
    console.log('fetching reservation', index);
    reservation = reservations[index];
    if ((ref = reservation.Instances) != null ? ref.length : void 0) {
      return fetchInstance(0, reservation.Instances, function() {
        return goToNext();
      });
    } else {
      return goToNext();
    }
  };

  fetchClient = function(index, clients, cb) {
    var goToNext, params;
    goToNext = function() {
      if (++index < clients.length) {
        return fetchClient(index, clients, cb);
      } else {
        return typeof cb === "function" ? cb() : void 0;
      }
    };
    console.log('fetching client', index);
    client = clients[index];
    AWS.config.update({
      accessKeyId: client.accessKey,
      secretAccessKey: client.secretKey,
      region: client.region
    });
    myEC2 = new AWS.EC2;
    params = {
      Owners: ['self'],
      Filters: [
        {
          Name: 'tag-key',
          Values: ['mis-ami-backup']
        }
      ]
    };
    return myEC2.describeImages(params, function(err, data) {
      var ref;
      if (!err && ((ref = data.Images) != null ? ref.length : void 0)) {
        return checkImageForDeletion(0, data.Images, function() {
          return myEC2.describeInstances(function(err, reservations) {
            return fetchReservation(0, reservations.Reservations, function() {
              return goToNext();
            });
          });
        });
      } else {
        logError(err);
        return myEC2.describeInstances(function(err, reservations) {
          return fetchReservation(0, reservations.Reservations, function() {
            return goToNext();
          });
        });
      }
    });
  };

  console.log('Started at', new Date);

  fetchClient(0, config.clients, function() {
    var error, html, i, j, len, len1, success, transporter;
    html = '<style>table td { padding-right: 20px; }</style>';
    html += '<p>EC2 Backup successfully ran at ' + dateFormat(new Date, 'dddd, mmmm dS, yyyy, h:MM:ss TT') + '</p>';
    if (successes.length > 0) {
      html += '<h4>Successes</h4>';
      html += '<table><tr><th>Date</th><th>Name</th><th>Message</th></tr>';
      for (i = 0, len = successes.length; i < len; i++) {
        success = successes[i];
        html += '<tr><td>' + success.time + '</td><td>' + success.name + '</td><td>' + success.message + '</td></tr>';
      }
      html += '</table>';
    }
    if (errors.length > 0) {
      html += '<h4>Errors</h4>';
      html += '<table><tr><th>Date</th><th>Name</th><th>Message</th></tr>';
      for (j = 0, len1 = errors.length; j < len1; j++) {
        error = errors[j];
        html += '<tr><td>' + error.time + '</td><td>' + error.name + '</td><td>' + error.message + '</td></tr>';
      }
      html += '</table>';
    }
    transporter = nodemailer.createTransport({
      host: config.mail.smtpServer,
      port: config.mail.port,
      auth: {
        user: config.mail.username,
        pass: config.mail.password
      }
    });
    transporter.sendMail({
      from: config.mail.from,
      to: config.mail.to,
      subject: config.mail.subject,
      html: html
    });
    console.log(html);
    return console.log('Done at', new Date);
  });

}).call(this);
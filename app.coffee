config = require './config'
dateFormat = require 'dateformat'
AWS = require 'aws-sdk'
nodemailer = require 'nodemailer'
smtpTransport = require 'nodemailer-smtp-transport'
myEC2 = undefined
name = ''
client = undefined

logError = (message) ->
  client.errors.push
    name: name
    message: message
    time: dateFormat new Date, 'h:MM:ss TT'
  console.error 'Error', name, message
  
logSuccess = (message) ->
  client.successes.push
    name: name
    message: message
    time: dateFormat new Date, 'h:MM:ss TT'
  console.log 'Success', name, message

checkImageForDeletion = (index, images, cb) ->
  goToNext = ->
    if ++index < images.length then checkImageForDeletion index, images, cb
    else cb?()
  console.log 'checking for deletion', index
  image = images[index]
  if Date.parse(image.CreationDate) < Date.now() - (client.daysToKeep * 24 * 60 * 60 * 1000)
    #deleting image
    params = ImageId: image.ImageId
    myEC2.deregisterImage params, (err, data) ->
      if not err
        logSuccess 'Deleted Image ' + image.ImageId
      else
        logError 'Delete Failed ' + image.ImageId
      goToNext()
  else
    goToNext()

fetchInstance = (index, instances, cb) ->
  goToNext = ->
    if ++index < instances.length then fetchInstance index, instances, cb
    else cb?()
  console.log 'fetching instance', index
  instance = instances[index]
  name = ''
  isExcluded = false
  for tag in instance.Tags
    if tag.Key is 'Name' then name = tag.Value
    isExcluded =  tag.Key is 'mis-ami-backup-excluded' and tag.Value is 'true'
  if not isExcluded
    now = new Date
    imageName = name + ' - ' + dateFormat(now, 'yyyy-mm-dd')
    params =
      InstanceId: instance.InstanceId
      Name: imageName
      NoReboot: true
    myEC2.createImage params, (err, data) ->
      if not err
        logSuccess 'Instance backed up'
        params = 
          Resources: [ data.ImageId ]
          Tags: [ {
            Key: 'mis-ami-backup'
            Value: 'true'
          } ]
        myEC2.createTags params, (err, data) ->
          if not err
            logSuccess 'Tagged an image'
          else
            logError 'Tagging Failed. Reason: ' + err
          goToNext()
      else
        logError 'Backup Failed. Reason: ' + err
        goToNext()
  else
    goToNext()

fetchReservation = (index, reservations, cb) ->
  goToNext = ->
    if ++index < reservations.length then fetchReservation index, reservations, cb
    else cb?()
  console.log 'fetching reservation', index
  reservation = reservations[index]
  if reservation.Instances?.length
    fetchInstance 0, reservation.Instances, ->
      goToNext()
  else
    goToNext()

fetchClient = (index, clients, cb) ->
  goToNext = ->
    if ++index < clients.length then fetchClient index, clients, cb
    else cb?()
  console.log 'fetching client', index
  client = clients[index]
  client.errors = []
  client.successes = []
  AWS.config.update
    accessKeyId: client.accessKey
    secretAccessKey: client.secretKey
    region: client.region
  myEC2 = new (AWS.EC2)
  params = 
    Owners: [ 'self' ]
    Filters: [ {
      Name: 'tag-key'
      Values: [ 'mis-ami-backup' ]
    } ]  
  myEC2.describeImages params, (err, data) ->
    if not err and data.Images?.length
      checkImageForDeletion 0, data.Images, ->
        myEC2.describeInstances (err, reservations) ->
          fetchReservation 0, reservations.Reservations, ->
            goToNext()
    else
      logError 'No images'
      myEC2.describeInstances (err, reservations) ->
        fetchReservation 0, reservations.Reservations, ->
          goToNext()

console.log 'Started at', new Date
fetchClient 0, config.clients, ->
  html = '<style>table td { padding-right: 20px; }</style>'
  html += '<p>EC2 Backup successfully ran on ' + dateFormat(new Date, 'dddd, mmmm dS, yyyy, h:MM:ss TT') + '</p>'
  for client in config.clients
    html += '<h3 style="padding-top: 20px">' + client.clientName + '</h3>'
    if client.successes.length > 0
      html += '<h4 style="color: green">Successes</h4>'
      html += '<table><tr><th>Date</th><th>Name</th><th>Message</th></tr>'
      for success in client.successes
        html += '<tr><td>' + success.time + '</td><td>' + success.name + '</td><td>' + success.message + '</td></tr>'
      html += '</table>'
    if client.errors.length > 0
      html += '<h4 style="color: red">Errors</h4>'
      html += '<table><tr><th>Date</th><th>Name</th><th>Message</th></tr>'
      for error in client.errors
        html += '<tr><td>' + error.time + '</td><td>' + error.name + '</td><td>' + error.message + '</td></tr>'
      html += '</table>'
  transporter = nodemailer.createTransport
    host: config.mail.smtpServer
    port: config.mail.port
    auth:
      user: config.mail.username
      pass: config.mail.password
  transporter.sendMail
    from: config.mail.from
    to: config.mail.to
    subject: config.mail.subject
    html: html
  console.log 'Done at', new Date

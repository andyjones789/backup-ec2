config = require('./config')
dateFormat = require('dateformat')
console.log new Date
config.clients.forEach (client) ->
  AWS = require('aws-sdk')
  # Set the credentials
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
    if !err
      data.Images.forEach (image) ->
        if Date.parse(image.CreationDate) < Date.now() - (client.daysToKeep * 24 * 60 * 60 * 1000)
          console.log 'Deleting image ' + image.Name
          params = ImageId: image.ImageId
          myEC2.deregisterImage params, (err, data) ->
            if !err
              console.log 'Successfully deleted'
            else
              console.log 'Delete failed: ' + err
    else
      console.log 'Error: ' + err
  # Get all instances
  myEC2.describeInstances (err, reservations) ->
    if !err
      console.dir reservations
      reservations.Reservations.forEach (reservation) ->
        reservation.Instances.forEach (instance) ->
          name = ''
          isExcluded = false
          instance.Tags.forEach (tag) ->
            if tag.Key == 'Name'
              name = tag.Value
            if tag.Key == 'mis-ami-backup-excluded' and tag.Value == 'true'
              isExcluded = true
              console.log 'Instance ' + name + ' excluded from backup'
            return
          if !isExcluded
            now = new Date
            imageName = name + ' - ' + dateFormat(now, 'yyyy-mm-dd')
            console.log 'Name: ' + imageName
            params = 
              InstanceId: instance.InstanceId
              Name: imageName
              NoReboot: true
            myEC2.createImage params, (err, data) ->
              if !err
                console.log 'Instance ' + name + ' successfully backed up'
                console.dir data
                params = 
                  Resources: [ data.ImageId ]
                  Tags: [ {
                    Key: 'mis-ami-backup'
                    Value: 'true'
                  } ]
                myEC2.createTags params, (err, data) ->
                  if !err
                    console.log 'Successfully tagged the image for ' + name
                  else
                    console.log 'Tagging failed for ' + name + ': ' + err
              else
                console.log 'Backup failed for ' + name + '. Reason: ' + err
    else
      console.log 'Error: ' + err
var
    config = require('./config')
    dateFormat = require('dateformat');

console.log(new Date());

config.clients.forEach(function(client) {

    var AWS = require('aws-sdk');

    // Set the credentials
    AWS.config.update({
        accessKeyId: client.accessKey,
        secretAccessKey: client.secretKey,
        region: client.region
    });

    var myEC2 = new AWS.EC2();

    var params = {
        Owners: [ 'self' ],
        Filters: [
            {
                Name: "tag-key",
                Values: [
                    "mis-ami-backup"
                ]
            }
        ]
    };

    myEC2.describeImages(params,function(err,data) {
        if(!err) {
            data.Images.forEach(function(image) {
                if(Date.parse(image.CreationDate) < Date.now() - (client.daysToKeep * 24 * 60 * 60 * 1000) ) {
                    console.log('Deleting image ' + image.Name);

                    var params = {
                        ImageId: image.ImageId
                    }

                    myEC2.deregisterImage(params,function(err,data) {
                        if(!err) {
                            console.log('Successfully deleted');
                        } else {
                            console.log('Delete failed: ' + err);
                        }
                    });
                }
            });
        } else {
            console.log('Error: ' + err);
        }
    });

    // Get all instances
    myEC2.describeInstances(function(err,reservations) {
        if(!err) {
            console.dir(reservations);

            reservations.Reservations.forEach(function(reservation) {
                reservation.Instances.forEach(function(instance) {
                    var name = '',
                        isExcluded = false;

                    instance.Tags.forEach(function(tag) {
                        if(tag.Key==='Name') {
                            name = tag.Value;
                        }

                        if(tag.Key==='mis-ami-backup-excluded' && tag.Value==='true') {
                            isExcluded=true;
                            console.log('Instance ' + name + ' excluded from backup');
                        }
                    });

                    if(!isExcluded) {

                        var now = new Date();

                        var imageName = name + ' - ' + dateFormat(now,"yyyy-mm-dd");

                        console.log('Name: ' + imageName);

                        var params = {
                            InstanceId: instance.InstanceId,
                            Name: imageName,
                            NoReboot: true
                        }

                        myEC2.createImage(params,function(err,data) {
                            if(!err) {
                                console.log('Instance ' + name + ' successfully backed up');

                                console.dir(data);

                                var params = {
                                    Resources: [
                                        data.ImageId
                                    ],
                                    Tags: [
                                        {
                                            Key: 'mis-ami-backup',
                                            Value: 'true'
                                        }
                                    ]
                                }

                                myEC2.createTags(params,function(err,data) {
                                    if(!err) {
                                        console.log('Successfully tagged the image for ' + name);
                                    } else {
                                        console.log('Tagging failed for ' + name + ': ' + err);
                                    }
                                });
                            } else {
                                console.log('Backup failed for ' + name + '. Reason: ' + err);
                            }
                        });
                    }
                });
            });

        } else {
            console.log('Error: ' + err);
        }
    });
});



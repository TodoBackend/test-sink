'use strict';
const AWS = require('aws-sdk');

const BUCKET_NAME = process.env.LAKE_BUCKET;
const s3 = new AWS.S3();

module.exports.handler = async event => {
    const key = 'testy/test';
    const body = "WE DID IT";

    const result = await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: body
    }).promise();

    console.log('S3 put result:', result);

    return {
        statusCode: 200,
        body: "WE PUT STUFF IN S3!"
    };
};
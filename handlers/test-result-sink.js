'use strict';
const AWS = require('aws-sdk');
const makeUuid = require('uuid/v4');

const BUCKET_NAME = process.env.LAKE_BUCKET;
const s3 = new AWS.S3();

module.exports.handler = async event => {
    const uuid = makeUuid();
    const key = `test-results/${uuid}`;
    const body = event.body;

    console.log('writing test results to',BUCKET_NAME,key);

    const result = await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: body
    }).promise();

    console.log('S3 put result:', result);

    return {
        statusCode: 201,
        body: uuid
    };
};
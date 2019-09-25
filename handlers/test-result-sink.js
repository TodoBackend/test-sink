'use strict';
const AWS = require('aws-sdk');
const makeUuid = require('uuid/v4');

const BUCKET_NAME = process.env.LAKE_BUCKET;
const TABLE_NAME = process.env.TEST_RESULTS_TABLE;

const s3 = new AWS.S3();
const dynamoDb = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async event => {
    const uuid = makeUuid();
    const testResults = event.body; // TODO: validation, DoS protection...

    await Promise.all([
        updateDb(uuid,testResults),
        writeResultsToS3(uuid,testResults)
    ]);

    return {
        statusCode: 201,
        body: uuid
    };
};

async function updateDb(uid,results){
    const item = {
        testResultId: uid,
        foo: '123'
    };

    const result = await dynamoDb.put({
        TableName: TABLE_NAME,
        Item: item
    }).promise();

    console.log('DynamoDb put result:', result);

    return result;
}

async function writeResultsToS3(uid,results){
    const key = `test-results/${uid}`;

    console.log('writing test results to',BUCKET_NAME,key);
    const result = await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: results
    }).promise();

    console.log('S3 put result:', result);
    return result;
}
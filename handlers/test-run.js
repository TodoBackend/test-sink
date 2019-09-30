'use strict';
require('honeycomb-beeline')({
    writeKey: process.env.HONEYCOMB_API_KEY,
    dataset: process.env.HONEYCOMB_DATASET
});

const AWS = require('aws-sdk');
const makeUuid = require('uuid/v4');

const BUCKET_NAME = process.env.LAKE_BUCKET;
const TABLE_NAME = process.env.TEST_RESULTS_TABLE;

const s3 = new AWS.S3();
const dynamoDb = new AWS.DynamoDB.DocumentClient();

module.exports.create = async event => {
    const uuid = makeUuid();
    const createdAt = new Date().toISOString();

    await createTestRunInDb({uid:uuid,createdAt});

    const baseUrl = event.requestContext.path;
    const testRunUrl = `${baseUrl}/${uuid}`;
    const testResultsUrl = `${testRunUrl}/results`;

    const response = {
        _links: {
            self: { href: testRunUrl },
            results: { href: testResultsUrl }
        }
    };

    return {
        statusCode: 201,
        headers: {
            "Location": testRunUrl,
            "Content-Type": "application/json;charset=utf-8",
            "Access-Control-Allow-Origin": "*" // TODO: lock down to todobackend.com
        },
        body: JSON.stringify(response)
    };
};

module.exports.recordResults = async (event) => {
    const testRunId = event.pathParameters.testRunId;
    const completedAt = new Date().toISOString();

    const testResults = event.body; // TODO: validation, DoS protection...

    await Promise.all([
        recordRunCompletionInDb({uid:testRunId,completedAt}),
        writeResultsToS3(testRunId,testResults)
    ]);

    return {
        statusCode: 201,
        headers: {
            "Access-Control-Allow-Origin": "*" // TODO: lock down to todobackend.com
        },
    };
};

async function createTestRunInDb({uid,createdAt}){
    const item = {
        testResultId: uid,
        createdAt
    };

    const result = await dynamoDb.put({
        TableName: TABLE_NAME,
        Item: item
    }).promise();

    console.log('DynamoDb put result:', result);

    return result;
}

async function recordRunCompletionInDb({uid,completedAt}){
    // TODO
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
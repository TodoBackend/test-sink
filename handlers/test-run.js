'use strict';
const beeline = require("honeycomb-beeline")({
  writeKey: process.env.HONEYCOMB_API_KEY,
  dataset: process.env.HONEYCOMB_DATASET,
  serviceName: "test-sink"
});

const AWS = require('aws-sdk');
const makeUuid = require('uuid/v4');
const useragent = require('useragent');

const BUCKET_NAME = process.env.LAKE_BUCKET;
const TABLE_NAME = process.env.TEST_RESULTS_TABLE;

const s3 = new AWS.S3();
const dynamoDb = new AWS.DynamoDB.DocumentClient();

function withTracePromise(metadataContext, fn, withTraceId, withParentSpanId, withDataset) {
    const trace = beeline.startTrace(metadataContext, withTraceId, withParentSpanId, withDataset);
    return fn().finally( ()=>{
      beeline.finishTrace(trace);
    } );
}

module.exports.create = (event, context) => {
    const ctx = beeline.unmarshalTraceContext((event.headers||{})["x-honeycomb-trace"] || "") || {};
    return withTracePromise({
        name: "testRunCreate",
        functionName: context.functionName,
        functionVersion: context.functionVersion,
        requestId: context.awsRequestId
      }, async () => {

        const testRunId = makeUuid();
        const createdAt = new Date().toISOString();
        beeline.addContext({testRunId});

        const ua = useragent.parse(event.requestContext.identity.userAgent);
        beeline.addContext({
            ua,
            "ua.family": ua.family,
            "ua.version": [ua.major,ua.minor,ua.patch].join("."),
            "ua.major": ua.major,
            "ua.minor": ua.minor,
            "ua.patch": ua.patch,
        });

        await createTestRunInDb({uid:testRunId,createdAt,ua});

        const baseUrl = event.requestContext.path;
        const testRunUrl = `${baseUrl}/${testRunId}`;
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
      },
      ctx.traceId, ctx.parentSpanId);
};

module.exports.recordResults = (event,context) => {
    const ctx = beeline.unmarshalTraceContext((event.headers||{})["x-honeycomb-trace"] || "") || {};
    return withTracePromise({
        name: "testResultPost",
        functionName: context.functionName,
        functionVersion: context.functionVersion,
        requestId: context.awsRequestId
      }, async () => {
        const testRunId = event.pathParameters.testRunId;
        const completedAt = new Date().toISOString();

        const testResults = event.body; // TODO: validation, DoS protection...
        
        beeline.addContext({testRunId});
        // TODO: add full duration of test runs

        await Promise.all([
            recordRunCompletionInDb({uid:testRunId,completedAt}),
            writeResultsToS3(testRunId,testResults)
        ]);

        return {
            statusCode: 201,
            headers: {
                "Access-Control-Allow-Origin": "*" // TODO: lock down to todobackend.com
            },
        }
      },
      ctx.traceId, ctx.parentSpanId);
}

async function createTestRunInDb({uid,createdAt}){
    const item = {
        testResultId: uid,
        createdAt
    };

    const span = beeline.startSpan({
        name: 'createTestRunInDb'
    });

    const result = await dynamoDb.put({
        TableName: TABLE_NAME,
        Item: item
    }).promise().finally( ()=> {
        beeline.finishSpan(span);
    });

    return result;
}

async function recordRunCompletionInDb({uid,completedAt}){
    const span = beeline.startSpan({
        name: 'recordRunCompletionInDb'
    });

    const result = await dynamoDb.update({
        TableName: TABLE_NAME,
        Key: {
            testResultId: uid
        }, 
        UpdateExpression: "set completedAt = :c",
        ExpressionAttributeValues: { ":c": completedAt },
    }).promise().finally( ()=> {
        beeline.finishSpan(span);
    });

    return result;
}

async function writeResultsToS3(uid,results){
    const key = `test-results/${uid}`;

    const span = beeline.startSpan({
        name: 'writeResultsToS3',
        bucket: BUCKET_NAME,
        key
    });

    try{
        return await s3.putObject({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: results
        }).promise();
    }finally{
        beeline.finishSpan(span);
    }
}
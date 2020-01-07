'use strict';

const beeline = require("honeycomb-beeline")({
  writeKey: process.env.HONEYCOMB_API_KEY,
  dataset: process.env.HONEYCOMB_DATASET,
  serviceName: "test-sink"
});

const AWS = require('aws-sdk');
const makeUuid = require('uuid/v4');
const useragent = require('useragent');

const beelineDecisionRecorder = require('../src/featureFlags/beelineDecisionRecorder')({
    beeline
});
const FEATURES = ['forceAsyncToBeInSeries'];

const featureFlags = require('../src/featureFlags')(
    FEATURES,
    {
        recordFeatureDecision: beelineDecisionRecorder
    }
);

const BUCKET_NAME = process.env.LAKE_BUCKET;
const TABLE_NAME = process.env.TEST_RESULTS_TABLE;

const s3 = new AWS.S3();
const dynamoDb = new AWS.DynamoDB.DocumentClient();

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
            headers: headersPlusCors({
                "Location": testRunUrl,
                "Content-Type": "application/json;charset=utf-8"
            }),
            body: JSON.stringify(response)
        };
      },
      ctx.traceId, ctx.parentSpanId);
};

module.exports.recordResults = (event,context) => {
    const featureFlagContext = featureFlags.newContext();

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

        const operationThunks = [
            () => recordRunCompletionInDb({uid:testRunId,completedAt}),
            () => writeResultsToS3(testRunId,testResults)
        ];

        if( featureFlagContext.forceAsyncToBeInSeries() ){
            await runOperationsInSeries(operationThunks);
        }else{
            await runOperationsInParallel(operationThunks);
        }

        return {
            statusCode: 201,
            headers: headersPlusCors(),
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
    return withSpanPromise({
        name: 'recordRunCompletionInDb'
    }, () => {
        return dynamoDb.update({
            TableName: TABLE_NAME,
            Key: {
                testResultId: uid
            }, 
            UpdateExpression: "set completedAt = :c",
            ExpressionAttributeValues: { ":c": completedAt },
        }).promise();
    });
}

function writeResultsToS3(uid,results){
    const key = `test-results/${uid}`;

    return withSpanPromise({
        name: 'writeResultsToS3',
        bucket: BUCKET_NAME,
        key
    }, () => {
        return s3.putObject({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: results
        }).promise();
    });
}

function withTracePromise(metadataContext, fn, withTraceId, withParentSpanId, withDataset) {
    const trace = beeline.startTrace(metadataContext, withTraceId, withParentSpanId, withDataset);
    return fn().finally( ()=>{
      beeline.finishTrace(trace);
    } );
}

function withSpanPromise(metadataContext, fn) {
    return beeline.startAsyncSpan(metadataContext, (span) => {
        return fn().finally( ()=> {
            beeline.finishSpan(span);
        });
    });
}

function headersPlusCors(additionalHeaaders={}){
    return {
        "Access-Control-Allow-Origin": "https://todobackend.com",
        ...additionalHeaaders
    };
}

function runOperationsInParallel(asyncOperationThunks){
    const operationPromises = asyncOperationThunks.map( thunk =>  thunk() )
    return Promise.all(operationPromises);
}

async function runOperationsInSeries(asyncOperationThunks){
    for( const thunk of asyncOperationThunks ){
        await thunk();
    }
}
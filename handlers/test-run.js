'use strict';

const AWS = require('aws-sdk');
const makeUuid = require('uuid/v4');
const useragent = require('useragent');

const newRequestContext = require('../src/requestContext');

const BUCKET_NAME = process.env.LAKE_BUCKET;
const TABLE_NAME = process.env.TEST_RESULTS_TABLE;

const s3 = new AWS.S3();
const dynamoDb = new AWS.DynamoDB.DocumentClient();

module.exports.create = (lambdaEvent, lambdaContext) => {
    const requestContext = newRequestContext({lambdaEvent,lambdaContext});
    const {observability} = requestContext;
    return observability.withTraceAsync(
        { name: "testRunCreate" }, 
        async () => {
            const testRunId = makeUuid();
            const createdAt = new Date().toISOString();
            const ua = useragent.parse(lambdaEvent.requestContext.identity.userAgent);

            observability.addContext({
                testRunId,
                ua,
                "ua.family": ua.family,
                "ua.version": [ua.major,ua.minor,ua.patch].join("."),
                "ua.major": ua.major,
                "ua.minor": ua.minor,
                "ua.patch": ua.patch,
            });

            await createTestRunInDb({uid:testRunId,createdAt,ua,observability});

            const baseUrl = lambdaEvent.requestContext.path;
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
        }
    );
};

module.exports.recordResults = (lambdaEvent,lambdaContext) => {
    const requestContext = newRequestContext({lambdaEvent,lambdaContext});
    const {observability,features} = requestContext;

    return observability.withTraceAsync(
        { name: "testResultPost" },
        async () => {
            const testRunId = lambdaEvent.pathParameters.testRunId;
            const completedAt = new Date().toISOString();

            const testResults = lambdaEvent.body; // TODO: validation, DoS protection...
            
            observability.addContext({testRunId});

            const operationThunks = [
                () => recordRunCompletionInDb({uid:testRunId,completedAt,observability}),
                () => writeResultsToS3({uid:testRunId,results:testResults,observability})
            ];

            if( features.forceAsyncToBeInSeries() ){
                await runOperationsInSeries(operationThunks);
            }else{
                await runOperationsInParallel(operationThunks);
            }

            return {
                statusCode: 201,
                headers: headersPlusCors(),
            };
        }
    );
}

async function createTestRunInDb({uid,createdAt,observability}){
    const item = {
        testResultId: uid,
        createdAt
    };

    return await observability.withSpanAsync({
        name: 'createTestRunInDb'
    }, () => {
        return dynamoDb.put({
            TableName: TABLE_NAME,
            Item: item
        }).promise();
    });
}

async function recordRunCompletionInDb({uid,completedAt,observability}){
    return observability.withSpanAsync({
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

function writeResultsToS3({uid,results,observability}){
    const key = `test-results/${uid}`;

    return observability.withSpanAsync({
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
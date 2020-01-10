const createBeeline = require("honeycomb-beeline");
const createBeelineDecisionRecorder = require('./featureFlags/beelineDecisionRecorder');
const createFeatureFlags = require('./featureFlags');

const FEATURES = ['forceAsyncToBeInSeries'];

const defaultBeeline = createBeeline({
  writeKey: process.env.HONEYCOMB_API_KEY,
  dataset: process.env.HONEYCOMB_DATASET,
  serviceName: "test-sink"
});

module.exports = function newRequestContext({lambdaContext,lambdaEvent},{beeline=defaultBeeline}={}) {
  const contextFromLambda = {
    'aws.functionName': lambdaContext.functionName,
    'aws.functionVersion': lambdaContext.functionVersion,
    'aws.requestId': lambdaContext.requestId
  };
  
  const observability = createBeelineWrapper(beeline,contextFromLambda);
  const features = createFeatureFlagWrapper({beeline}).newContext();

  return {
    observability,
    features
  };
}

function createFeatureFlagWrapper({beeline}){
  const recordFeatureDecision = createBeelineDecisionRecorder({beeline});
  return createFeatureFlags( FEATURES, {recordFeatureDecision});
}

function createBeelineWrapper(beeline,contextFromLambda){
  function withTraceAsync(additionalContext,asyncFn,...args){
    metadataContext = {
      ...contextFromLambda,
      ...additionalContext,
    }
    const trace = beeline.startTrace(metadataContext,...args);

    return asyncFn()
    .catch( error => {
      beeline.addContext({error: error});
      throw error;
    }) 
    .finally( asyncResult => {
      beeline.finishTrace(trace);
      return asyncResult;
    })
  }

  function withSpanAsync(metadataContext, asyncFn){
    const promise = beeline.startAsyncSpan(metadataContext, span => {
      return asyncFn()
      .catch( error => {
        addContext('error', error);
        throw error;
      }) 
      .finally( asyncResult => {
        beeline.finishSpan(span);
        return asyncResult;
      });
    });

    return promise;
  }

  function addContext(contextMapOrKey,maybeValue){
    if( typeof contextMapOrKey !== 'Object' && maybeValue ){
      beeline.addContext({[contextMapOrKey]:maybeValue});
    }else{
      beeline.addContext(contextMapOrKey);
    }
  }

  return {
    withTraceAsync,
    withSpanAsync,
    addContext
  };
}
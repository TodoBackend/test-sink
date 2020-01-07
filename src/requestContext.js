module.exports = function newRequestContext({lambdaContext,lambdaEvent},{beeline}={}) {
  const contextFromLambda = {
    'aws.functionName': lambdaContext.functionName,
    'aws.functionVersion': lambdaContext.functionVersion,
    'aws.requestId': lambdaContext.requestId
  };
  
  const observability = createBeelineWrapper(beeline,contextFromLambda);
  
  return {
    observability
  };
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

  function withSpanAsync(asyncFn){
    const span = beeline.startSpan();

    return asyncFn()
    .catch( error => {
      beeline.addContext({error: error});
      throw error;
    }) 
    .finally( asyncResult => {
      beeline.finishSpan(span);
      return asyncResult;
    })
  }

  return {
    withTraceAsync,
    withSpanAsync
  };
}
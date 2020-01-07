module.exports = function createBeelineDecisionRecorder({beeline}){
  return function recordFeatureDecision(feature,decision){
    console.log(`FEATURE ${feature} IS ${decision}`);
    beeline.customContext.add(`feature_flags.${feature}`,decision);
  }
};
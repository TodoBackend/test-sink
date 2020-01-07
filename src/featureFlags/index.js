const noop = ()=>{};

module.exports = function createFeatureFlags(
  features,
  {flipCoin=randomCoinFlip,recordFeatureDecision=noop}= {}
) {
  function newContext(){
    let context = {};
    features.forEach(feature => {
      const decision = flipCoin();

      // freeze decision into a function
      context[feature] = ()=>{
        recordFeatureDecision(feature,decision);
        return decision;
      }
    });

    return context;
  }

  return {
    newContext
  };
}

function randomCoinFlip() {
  return Math.random() > 0.5
}
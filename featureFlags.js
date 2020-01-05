module.exports = function createFeatureFlags(features,{flipCoin=randomCoinFlip}= {}) {
  function newContext(){
    let context = {};
    features.forEach(feature => {
      const decision = flipCoin();

      // freeze decision into a function
      context[feature] = ()=>decision;
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
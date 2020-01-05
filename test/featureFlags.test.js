const createFeatureFlags = require('../featureFlags');

describe('featureFlags', () => {
  it('constructs', () => {
    const featureFlags = createFeatureFlags();
    expect(featureFlags).toBeDefined();
    expect(featureFlags.newContext).toBeInstanceOf(Function);
  });

  describe('random A/B bucketing', () => {
    test('within the same context scope, consistently returns the same decision for a feature', () => {
      const features = ['exampleFeature'];
      const flipCoin = createFlappingCoinFlip(true);
      const featureFlags = createFeatureFlags(features,{flipCoin});
      const ffContext = featureFlags.newContext();

      const flaggingDecisions = Array.from(Array(100)).map( ffContext.exampleFeature );

      expect(flaggingDecisions).toSatisfyAll(d=> d===true);
    });

    test('within the same context scope, decisions are consistent per feature, but vary across features', () => {
      const features = ['featureA','featureB'];
      const flipCoin = createFlappingCoinFlip(true);
      const featureFlags = createFeatureFlags(features,{flipCoin});
      const ffContext = featureFlags.newContext();

      const decisionsForA = Array.from(Array(100)).map( ffContext.featureA );
      const decisionsForB = Array.from(Array(100)).map( ffContext.featureB );

      expect(decisionsForA).toSatisfyAll(d=> d===true);
      expect(decisionsForB).toSatisfyAll(d=> d===false);
    });
  });

  test('feature decisions are roughly 50/50', () => {
    const featureFlags = createFeatureFlags(['someFeature']);
    const decisions = Array.from(Array(10000)).map( ()=> featureFlags.newContext().someFeature() );
    
    const positiveDecisions = decisions.filter( decision => decision===true );
    expect(positiveDecisions.length).toBeWithin(4500,5500);
  });
});

function createFlappingCoinFlip(initialState=true){
  let state = initialState;
  return function flipCoin(){
    const result = state;
    state = !state;
    return result;
  }
}
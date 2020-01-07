const createBeelineDecisionRecorder = require('../../src/featureFlags/beelineDecisionRecorder');

describe('beelineDecisionRecorder', () => {
  it('adds to beeline context', () => {
    const fakeBeeline = {
      customContext: {
        add: jest.fn()
      }
    };

    const beelineDecisionRecorder = createBeelineDecisionRecorder({beeline:fakeBeeline});

    beelineDecisionRecorder('featureA',true);
    beelineDecisionRecorder('featureB',false);

    expect(fakeBeeline.customContext.add).toHaveBeenCalledWith('feature_flags.featureA',true);
    expect(fakeBeeline.customContext.add).toHaveBeenCalledWith('feature_flags.featureB',false);
  });
});
const newRequestContext = require('../src/requestContext');

describe('requestContext', () => {
  describe('observability', () => {
    describe('withTraceAsync', () => {
      it('starts a beeline trace, with additional context from AWS lambda', () => {
        const fakeLambdaEvent = {};
        const fakeLambdaContext = {
          functionName: 'lambda name',
          functionVersion: 'lambda version',
          requestId: 'aws request id'
        };

        const spyBeeline = createFakeBeeline();
        const observability = newRequestContext({
          lambdaEvent:fakeLambdaEvent,
          lambdaContext:fakeLambdaContext
        },{
          beeline:spyBeeline
        }
        ).observability;
        
        const dummyAsyncFn = ()=> Promise.resolve();

        observability.withTraceAsync({extra:'context'},dummyAsyncFn);

        const expectedTraceContext = {
          'aws.functionName': fakeLambdaContext.functionName,
          'aws.functionVersion': fakeLambdaContext.functionVersion,
          'aws.requestId': fakeLambdaContext.requestId,
          extra:'context',
        }

        expect(spyBeeline.startTrace).toHaveBeenCalledWith(
          expectedTraceContext
        );
      });

      it('returns the result of the async fn, and tells beeline to finish the trace', async () => {
        const fakeBeeline = createFakeBeeline({
          startTrace(){ return 'fakeTrace'; }
        });
        const observability = observabilityWithFakeBeeline(fakeBeeline);
        
        const result = observability.withTraceAsync({}, ()=> Promise.resolve('result from async function'));

        expect(fakeBeeline.finishTrace).not.toHaveBeenCalled();
        await expect(result).resolves.toEqual('result from async function');
        expect(fakeBeeline.finishTrace).toHaveBeenCalledWith('fakeTrace');
      });

      it('tells beeline the trace has finished, with additional error context, if the async function rejects', async () => {
        const fakeBeeline = createFakeBeeline({
          startTrace(){ return 'fakeTrace'; }
        });
        const observability = observabilityWithFakeBeeline(fakeBeeline);
        
        const result = observability.withTraceAsync({}, ()=> Promise.reject('error from async func'));

        await expect(result).rejects.toEqual('error from async func');

        expect(fakeBeeline.addContext).toHaveBeenCalledWith({error:'error from async func'});
        expect(fakeBeeline.finishTrace).toHaveBeenCalledWith('fakeTrace');
      });
    });

    describe('withSpanAsync', () => {
      it('starts a beeline span', () => {
        const spyBeeline = createFakeBeeline();
        const observability = observabilityWithFakeBeeline(spyBeeline);
        
        observability.withSpanAsync( {extra:'context'}, () => Promise.resolve() );

        expect(spyBeeline.startAsyncSpan).toHaveBeenCalledWith({extra:'context'},expect.anything());
      });

      it('runs the async fn and returns the result, and tells beeline to finish the span', async () => {
        const fakeBeeline = createFakeBeeline({
          startAsyncSpan: jest.fn( (context,spanFn) => spanFn('fakeSpan') ),
        });
        const observability = observabilityWithFakeBeeline(fakeBeeline);
        
        const result = observability.withSpanAsync({}, ()=> Promise.resolve('result from async function'));

        expect(fakeBeeline.finishSpan).not.toHaveBeenCalled();
        await expect(result).resolves.toEqual('result from async function');
        expect(fakeBeeline.finishSpan).toHaveBeenCalledWith('fakeSpan');
      });

      it('tells beeline the span has finished, with additional error context, if the async function rejects', async () => {
        const fakeBeeline = createFakeBeeline({
          startAsyncSpan: jest.fn( (context,spanFn) => spanFn('fakeSpan') ),
        });
        const observability = observabilityWithFakeBeeline(fakeBeeline);
        
        const result = observability.withSpanAsync({}, ()=> Promise.reject('error from async func'));

        await expect(result).rejects.toEqual('error from async func');

        expect(fakeBeeline.addContext).toHaveBeenCalledWith({error:'error from async func'});
        expect(fakeBeeline.finishSpan).toHaveBeenCalledWith('fakeSpan');
      });
    });

    describe('addContext', () => {
      it('proxies through to beeline', () => {
        const fakeBeeline = createFakeBeeline();
        const observability = observabilityWithFakeBeeline(fakeBeeline);

        observability.addContext({foo:1,bar:2});

        expect(fakeBeeline.addContext).toHaveBeenCalledWith({foo:1,bar:2});
      });

      it('supports adding a single key-value pair', () => {
        const fakeBeeline = createFakeBeeline();
        const observability = observabilityWithFakeBeeline(fakeBeeline);

        observability.addContext('key','value');

        expect(fakeBeeline.addContext).toHaveBeenCalledWith({key:'value'});
      });
    });

    function createFakeBeeline(overrides={}){
      return {
          startTrace: jest.fn(),
          finishTrace: jest.fn(),
          startAsyncSpan: jest.fn( (context,spanFn) => spanFn('blah') ),
          finishSpan: jest.fn(),
          addContext: jest.fn(),
          ...overrides
      };
    }

    function observabilityWithFakeBeeline(fakeBeeline){
      const dummyLambdaArgs = {
        lambdaContext:{},
        lambdaEvent:{}
      };
      const requestContext = newRequestContext(dummyLambdaArgs,{beeline:fakeBeeline});
      return requestContext.observability;
    }
  });
});
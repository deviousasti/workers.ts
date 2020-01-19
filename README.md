# workers.ts
Simple proxy which runs methods in a web-worker, async and strongly-typed

## Usage

1. Include workers.ts in your project

2. Make any class you wish to proxy extend `Workers.Host`, and call `registerWorker` to track.
   
   ```typescript
    export class CalculatorWorker extends Workers.Host {
        add(x: number, y: number) {
               return x + y;
         }
    }
   
   CalculatorWorker.registerWorker(); 
   ```

3. Anywhere in your code call `createClient` to create a proxy:

   ```typescript
   let calc = CalculatorWorker.createClient()
   let result = await calc.add(2, 2) 
   ```

4. When you are done, call `dispose()` to shut down the worker

   ```typescript
   calc.dispose();
   ```

You can use `importScripts` in the class to pull in additional files your class needs, or use a module loader.

All method parameters, and return types are promises and are strongly typed. 

You can use fields to maintain internal state in the class, but these are not reflected in the proxy.


The type function is:

```
Proxy(f(x) -> y) = f(x) -> Promise<y>
Proxy(f(x) -> Promise<y>) = f(x) -> Promise<y>
```
